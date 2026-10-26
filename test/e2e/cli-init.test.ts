import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import { type AddressInfo, createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { type Browser, chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONFIG_FILE, PAGE_FILE, SNIPPET_FILE } from '../../src/cli/init.js';
import { type LogServer, startLogServer } from '../../src/core/server.js';

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('../..', import.meta.url));

const KAKAO_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S918N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 KAKAOTALK/25.4.0';

let projectDir: string;
let logServer: LogServer;
let pageServer: Server;
let browser: Browser;
let baseUrl: string;
let config: { enabled: boolean; token: string; ws: { host: string; port: number; scheme: string } };

async function freePort(): Promise<number> {
  const probe = createNetServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
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
  projectDir = mkdtempSync(join(tmpdir(), 'kakao-devtools-cli-e2e-'));
  const port = await freePort();

  const { stdout } = await execFileAsync(
    process.execPath,
    [join(root, 'dist', 'cli', 'bin.js'), 'init', '--port', String(port)],
    { cwd: projectDir },
  );
  expect(stdout).toContain(CONFIG_FILE);

  config = JSON.parse(readFileSync(join(projectDir, CONFIG_FILE), 'utf8'));
  logServer = await startLogServer({ token: config.token, port, log: () => {} });

  pageServer = createHttpServer((request, response) => {
    const name = request.url === `/${SNIPPET_FILE}` ? SNIPPET_FILE : PAGE_FILE;
    const type = name === SNIPPET_FILE ? 'text/javascript' : 'text/html';
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    response.end(readFileSync(join(projectDir, name)));
  });

  await new Promise<void>((resolve) => pageServer.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(pageServer.address() as AddressInfo).port}/`;
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => pageServer.close(() => resolve()));
  await logServer.close();
  rmSync(projectDir, { recursive: true, force: true });
});

describe('kakao-devtools-cli init', () => {
  it('scaffolds a setup that delivers a log from the KakaoTalk in-app browser', async () => {
    expect(config.enabled).toBe(true);
    expect(config.ws.scheme).toBe('ws');
    expect(config.ws.port).toBe(logServer.port);

    const context = await browser.newContext({ userAgent: KAKAO_UA });
    const page = await context.newPage();

    await page.goto(baseUrl);
    await page.evaluate(() => {
      console.log('hello from the scaffolded page');
    });

    await waitFor(() => logServer.store.entries().length >= 1);

    const entry = logServer.store.entries()[0];
    expect(entry?.kind).toBe('log');
    expect(entry?.args).toEqual(['hello from the scaffolded page']);
    expect(logServer.sessions.list()[0]?.platform).toBe('android');

    await context.close();
  });
});
