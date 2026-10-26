import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { listTypeScriptFiles } from './sources.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(root, 'src');
const browserDir = join(srcDir, 'browser');
const browserEntry = join(browserDir, 'index.ts');

function runTypeScript(args) {
  const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  execFileSync(process.execPath, [tsc, ...args], { cwd: root, stdio: 'inherit' });
}

function typecheckNode() {
  if (listTypeScriptFiles(srcDir).length === 0) {
    console.log('typecheck (node): no sources, skipped');
    return;
  }
  runTypeScript(['-p', 'tsconfig.json', '--noEmit']);
}

function typecheckBrowser() {
  if (listTypeScriptFiles(browserDir).length === 0) {
    console.log('typecheck (browser): no sources, skipped');
    return;
  }
  runTypeScript(['-p', 'tsconfig.browser.json']);
}

function emitNode() {
  if (listTypeScriptFiles(srcDir).length === 0) {
    console.log('build (node): no sources, skipped');
    return;
  }
  runTypeScript(['-p', 'tsconfig.json']);
}

async function bundleBrowser() {
  if (!existsSync(browserEntry)) {
    console.log('build (browser): no entry, skipped');
    return;
  }
  await esbuild.build({
    entryPoints: [browserEntry],
    outfile: join(root, 'dist', 'browser', 'kakao-devtools.js'),
    bundle: true,
    format: 'iife',
    globalName: 'KakaoDevtools',
    target: 'es2017',
    minify: true,
    sourcemap: true,
    logLevel: 'info',
  });
}

if (process.argv.includes('--typecheck')) {
  typecheckNode();
  typecheckBrowser();
} else {
  emitNode();
  await bundleBrowser();
}
