import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type LogServer, startLogServer } from '../../src/core/server.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const TOKEN = 'e2e-token';

const KAKAO_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S918N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 KAKAOTALK/25.4.0';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

let logServer: LogServer;
let pageServer: Server;
let baseUrl: string;
let browser: Browser;

function probePage(wsPort: number): string {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>kakao-devtools probe</title></head>
  <body>
    <script>
      window.__KAKAO_DEVTOOLS__ = {
        enabled: true,
        token: ${JSON.stringify(TOKEN)},
        ws: { host: '127.0.0.1', port: ${wsPort}, scheme: 'ws' },
      };
    </script>
    <script src="/kakao-devtools.js"></script>
    <script>
      console.log('probe log', { ok: true });
      setTimeout(function () {
        throw new Error('probe failure');
      }, 0);
    </script>
  </body>
</html>`;
}

async function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('timed out while waiting for a condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

beforeAll(async () => {
  logServer = await startLogServer({ token: TOKEN, port: 0, log: () => {} });

  pageServer = createServer(async (request, response) => {
    if (request.url === '/kakao-devtools.js') {
      const bundle = await readFile(join(root, 'dist', 'browser', 'kakao-devtools.js'));
      response.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
      response.end(bundle);
      return;
    }

    response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    response.end(probePage(logServer.port));
  });

  await new Promise<void>((resolve) => pageServer.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(pageServer.address() as AddressInfo).port}/`;
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => pageServer.close(() => resolve()));
  await logServer.close();
});

describe('snippet pipeline in a desktop browser', () => {
  it('delivers a console message and an uncaught error to the log server core', async () => {
    const context = await browser.newContext({ userAgent: KAKAO_UA });
    const page = await context.newPage();

    await page.goto(baseUrl);
    await waitFor(() => logServer.store.entries().length >= 2);

    const entries = logServer.store.entries();
    const [first, second] = entries;
    expect(first).toMatchObject({ kind: 'log', level: 'log' });
    expect(first?.args).toEqual(['probe log', { ok: true }]);
    expect(second).toMatchObject({ kind: 'error' });
    expect(second?.message).toContain('probe failure');

    const session = logServer.sessions.list()[0];
    expect(session?.platform).toBe('android');
    expect(session?.url).toBe(baseUrl);

    await context.close();
  });

  it('does not deliver anything from a browser that is not KakaoTalk', async () => {
    const context = await browser.newContext({ userAgent: DESKTOP_UA });
    const page = await context.newPage();
    const before = logServer.store.entries().length;

    await page.goto(baseUrl);
    await page.waitForTimeout(500);

    expect(logServer.store.entries().length).toBe(before);

    await context.close();
  });
});
