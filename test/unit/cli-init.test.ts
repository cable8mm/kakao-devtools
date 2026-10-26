import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG_FILE, initProject, PAGE_FILE, SNIPPET_FILE } from '../../src/cli/init.js';

const created: string[] = [];

function makeProject(): { cwd: string; snippetSource: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'kakao-devtools-init-'));
  created.push(cwd);
  const snippetSource = join(cwd, 'snippet-source.js');
  writeFileSync(snippetSource, '/* snippet */\n');
  return { cwd, snippetSource };
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8'));
}

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('initProject', () => {
  it('writes a configuration, the snippet and a page', async () => {
    const { cwd, snippetSource } = makeProject();

    const result = await initProject({ cwd, snippetSource, environment: 'development' });

    expect(readFileSync(result.snippetPath, 'utf8')).toBe('/* snippet */\n');

    const config = readJson(result.configPath);
    expect(config).toMatchObject({
      enabled: true,
      ws: { host: '127.0.0.1', port: 7890, scheme: 'ws' },
    });
    expect(config.token).toMatch(/^[0-9a-f]{32}$/);

    const page = readFileSync(result.pagePath, 'utf8');
    expect(page).toContain('window.__KAKAO_DEVTOOLS__');
    expect(page).toContain(`./${SNIPPET_FILE}`);
    expect(page).toContain(String(config.token));
  });

  it('disables activation when the environment is production', async () => {
    const { cwd, snippetSource } = makeProject();

    const result = await initProject({ cwd, snippetSource, environment: 'production' });

    expect(readJson(result.configPath).enabled).toBe(false);
  });

  it('exposes a configurable ws destination', async () => {
    const { cwd, snippetSource } = makeProject();

    const result = await initProject({
      cwd,
      snippetSource,
      scheme: 'wss',
      host: 'devtools.example.ts.net',
      port: 443,
    });

    expect(readJson(result.configPath).ws).toEqual({
      host: 'devtools.example.ts.net',
      port: 443,
      scheme: 'wss',
    });
    expect(readFileSync(result.pagePath, 'utf8')).toContain('"scheme":"wss"');
  });

  it('keeps the token when init runs again', async () => {
    const { cwd, snippetSource } = makeProject();

    const first = await initProject({ cwd, snippetSource });
    const second = await initProject({ cwd, snippetSource });

    expect(second.reusedToken).toBe(true);
    expect(second.config.token).toBe(first.config.token);
    expect(readJson(join(cwd, CONFIG_FILE)).token).toBe(first.config.token);
  });

  it('keeps the existing ws destination unless a flag overrides it', async () => {
    const { cwd, snippetSource } = makeProject();
    await initProject({ cwd, snippetSource, host: 'tunnel.example', port: 43_210, scheme: 'wss' });

    const kept = await initProject({ cwd, snippetSource });
    expect(kept.config.ws).toEqual({ host: 'tunnel.example', port: 43_210, scheme: 'wss' });

    const overridden = await initProject({ cwd, snippetSource, port: 8_000 });
    expect(overridden.config.ws).toEqual({ host: 'tunnel.example', port: 8_000, scheme: 'wss' });
  });

  it('fails clearly when the snippet bundle is missing', async () => {
    const { cwd } = makeProject();

    await expect(initProject({ cwd, snippetSource: join(cwd, 'missing.js') })).rejects.toThrow(
      /bundle is missing/,
    );
  });

  it('refuses an existing configuration without a token', async () => {
    const { cwd, snippetSource } = makeProject();
    writeFileSync(join(cwd, CONFIG_FILE), JSON.stringify({ enabled: true }));

    await expect(initProject({ cwd, snippetSource })).rejects.toThrow(/has no token/);
  });

  it('rejects an invalid ws port and scheme', async () => {
    const { cwd, snippetSource } = makeProject();

    await expect(initProject({ cwd, snippetSource, port: 0 })).rejects.toThrow(/port/);
    await expect(initProject({ cwd, snippetSource, scheme: 'http' as 'ws' })).rejects.toThrow(
      /scheme/,
    );
  });
});
