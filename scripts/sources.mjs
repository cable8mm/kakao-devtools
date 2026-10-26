import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Lists every `.ts` file below `dir`, recursively, sorted by full path. */
export function listTypeScriptFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTypeScriptFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files.sort();
}
