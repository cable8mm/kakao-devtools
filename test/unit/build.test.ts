import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { listTypeScriptFiles } from '../../scripts/sources.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('listTypeScriptFiles', () => {
  const created = [];

  function makeTree() {
    const dir = mkdtempSync(join(tmpdir(), 'kakao-devtools-'));
    created.push(dir);
    mkdirSync(join(dir, 'nested', 'deep'), { recursive: true });
    writeFileSync(join(dir, 'a.ts'), '');
    writeFileSync(join(dir, 'nested', 'b.ts'), '');
    writeFileSync(join(dir, 'nested', 'deep', 'c.ts'), '');
    writeFileSync(join(dir, 'skip.js'), '');
    writeFileSync(join(dir, 'nested', 'skip.mjs'), '');
    return dir;
  }

  afterEach(() => {
    for (const dir of created.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty list for a missing directory', () => {
    expect(listTypeScriptFiles(join(repoRoot, 'does-not-exist'))).toEqual([]);
  });

  it('finds .ts files recursively and ignores other extensions', () => {
    const dir = makeTree();

    expect(listTypeScriptFiles(dir)).toEqual([
      join(dir, 'a.ts'),
      join(dir, 'nested', 'b.ts'),
      join(dir, 'nested', 'deep', 'c.ts'),
    ]);
  });

  it('finds no sources in a repository that has no product code', () => {
    expect(listTypeScriptFiles(join(repoRoot, 'src'))).toEqual([]);
  });
});
