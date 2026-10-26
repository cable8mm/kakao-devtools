import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

describe('package manifest', () => {
  it('cannot be published', () => {
    expect(manifest.private).toBe(true);
    expect(manifest.license).toBe('UNLICENSED');
    expect(manifest.scripts.prepublishOnly).toBe('node scripts/refuse-publish.mjs');
  });

  it('fails the prepublishOnly step that npm runs before publishing', () => {
    expect.assertions(1);

    try {
      execFileSync(process.execPath, [join(repoRoot, 'scripts', 'refuse-publish.mjs')], {
        cwd: repoRoot,
        stdio: 'pipe',
      });
    } catch (error) {
      expect(error.status).toBe(1);
    }
  });

  it('targets Node 24 and later as ESM', () => {
    expect(manifest.type).toBe('module');
    expect(manifest.engines.node).toBe('>=24');
  });

  it('exposes the library entry point and the snippet file', () => {
    expect(Object.keys(manifest.exports).sort()).toEqual(['.', './snippet']);
    expect(manifest.exports['./snippet']).toBe('./dist/browser/kakao-devtools.js');
  });

  it('exposes the CLI and MCP binaries', () => {
    expect(Object.keys(manifest.bin).sort()).toEqual(['kakao-devtools-cli', 'kakao-devtools-mcp']);
  });

  it('keeps express an optional peer dependency', () => {
    expect(manifest.peerDependencies.express).toBeDefined();
    expect(manifest.peerDependenciesMeta.express.optional).toBe(true);
  });
});
