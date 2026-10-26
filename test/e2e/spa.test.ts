import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type LogServer, startLogServer } from '../../src/core/server.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const TOKEN = 'spa-token';

const KAKAO_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S918N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 KAKAOTALK/25.4.0';

let logServer: LogServer;
let pageServer: Server;
let browser: Browser;
let baseUrl: string;

function spaPage(): string {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>spa probe</title></head>
  <body>
    <nav><a id="to-settings" href="/settings">Settings</a></nav>
    <main id="view"></main>
    <script>
      window.__KAKAO_DEVTOOLS__ = {
        enabled: true,
        token: ${JSON.stringify(TOKEN)},
        ws: { host: '127.0.0.1', port: ${logServer.port}, scheme: 'ws' },
      };

      var views = { '/': 'home view', '/settings': 'settings view' };

      function render() {
        document.getElementById('view').textContent = views[window.location.pathname] || 'not found';
      }

      document.addEventListener('click', function (event) {
        var link = event.target.closest('a');
        if (!link) return;
        event.preventDefault();
        window.history.pushState(null, '', link.getAttribute('href'));
        render();
      });

      window.addEventListener('popstate', render);
      render();
    </script>
    <script type="module">
      import('/kakao-devtools.js');
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
    response.end(spaPage());
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

describe('snippet in a single-page application', () => {
  it('loads through an import and keeps delivering after a route change', async () => {
    const context = await browser.newContext({ userAgent: KAKAO_UA });
    const page = await context.newPage();

    await page.goto(baseUrl);
    expect(await page.locator('#view').textContent()).toBe('home view');

    await page.locator('#to-settings').click();
    expect(await page.locator('#view').textContent()).toBe('settings view');
    expect(new URL(page.url()).pathname).toBe('/settings');

    await page.evaluate(() => {
      console.log('log from the settings view');
    });

    await waitFor(() => logServer.store.entries().length >= 1);

    const entry = logServer.store.entries()[0];
    expect(entry?.kind).toBe('log');
    expect(entry?.args).toEqual(['log from the settings view']);
    expect(logServer.sessions.list()[0]?.platform).toBe('android');

    await context.close();
  });
});
