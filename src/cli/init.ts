import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_WS_HOST, DEFAULT_WS_PORT, type WsScheme } from '../shared/protocol.js';

export const CONFIG_FILE = 'kakao-devtools.config.json';
export const SNIPPET_FILE = 'kakao-devtools.js';
export const PAGE_FILE = 'kakao-devtools.html';

export interface GeneratedConfig {
  enabled: boolean;
  token: string;
  ws: { host: string; port: number; scheme: WsScheme };
}

export interface InitOptions {
  cwd: string;
  host?: string;
  port?: number;
  scheme?: WsScheme;
  environment?: string;
  snippetSource?: string;
  generateToken?: () => string;
}

export interface InitResult {
  configPath: string;
  pagePath: string;
  snippetPath: string;
  config: GeneratedConfig;
  reusedToken: boolean;
}

const SCHEMES: WsScheme[] = ['ws', 'wss'];

function defaultToken(): string {
  return randomBytes(16).toString('hex');
}

function isWsScheme(value: unknown): value is WsScheme {
  return value === 'ws' || value === 'wss';
}

function parseConfig(raw: string, path: string): GeneratedConfig {
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${path} must contain a JSON object`);
  }

  const config = parsed as Partial<GeneratedConfig>;
  if (typeof config.token !== 'string' || config.token === '') {
    throw new Error(`${path} has no token; delete it and run init again`);
  }
  if (!isWsScheme(config.ws?.scheme) || typeof config.ws?.host !== 'string') {
    throw new Error(`${path} has no ws destination; delete it and run init again`);
  }

  return {
    enabled: config.enabled === true,
    token: config.token,
    ws: { host: config.ws.host, port: config.ws.port ?? DEFAULT_WS_PORT, scheme: config.ws.scheme },
  };
}

async function readExistingConfig(path: string): Promise<GeneratedConfig | undefined> {
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    return parseConfig(await readFile(path, 'utf8'), path);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${path} is not valid JSON; fix or delete it and run init again`);
    }
    throw error;
  }
}

function renderPage(config: GeneratedConfig): string {
  const inline = JSON.stringify(config).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>kakao-devtools</title>
  </head>
  <body>
    <p>Add this to a page you open in the KakaoTalk in-app browser:</p>
    <pre>&lt;script&gt;window.__KAKAO_DEVTOOLS__ = ${inline.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')};&lt;/script&gt;
&lt;script src="./${SNIPPET_FILE}"&gt;&lt;/script&gt;</pre>
    <script>
      window.__KAKAO_DEVTOOLS__ = ${inline};
    </script>
    <script src="./${SNIPPET_FILE}"></script>
  </body>
</html>
`;
}

/**
 * Writes the snippet, a page that loads it, and a configuration holding the token
 * and the tunnel destination. Running init again keeps the existing token.
 */
export async function initProject(options: InitOptions): Promise<InitResult> {
  const cwd = options.cwd;
  const configPath = join(cwd, CONFIG_FILE);
  const pagePath = join(cwd, PAGE_FILE);
  const snippetPath = join(cwd, SNIPPET_FILE);

  const snippetSource =
    options.snippetSource ??
    fileURLToPath(new URL('../browser/kakao-devtools.js', import.meta.url));

  if (!existsSync(snippetSource)) {
    throw new Error(
      `The browser snippet bundle is missing at ${snippetSource}. Build the package before running init.`,
    );
  }

  const existing = await readExistingConfig(configPath);
  const environment = options.environment ?? process.env.NODE_ENV ?? '';

  const config: GeneratedConfig = {
    enabled: environment !== 'production',
    token: existing?.token ?? (options.generateToken ?? defaultToken)(),
    ws: {
      host: options.host ?? existing?.ws.host ?? DEFAULT_WS_HOST,
      port: options.port ?? existing?.ws.port ?? DEFAULT_WS_PORT,
      scheme: options.scheme ?? existing?.ws.scheme ?? 'ws',
    },
  };

  if (!isWsScheme(config.ws.scheme)) {
    throw new Error(`scheme must be "ws" or "wss", received ${JSON.stringify(config.ws.scheme)}`);
  }
  if (!Number.isInteger(config.ws.port) || config.ws.port <= 0 || config.ws.port > 65_535) {
    throw new Error(`port must be a port number, received ${JSON.stringify(config.ws.port)}`);
  }

  await mkdir(cwd, { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await copyFile(snippetSource, snippetPath);
  await writeFile(pagePath, renderPage(config), 'utf8');

  return {
    configPath,
    pagePath,
    snippetPath,
    config,
    reusedToken: existing !== undefined,
  };
}
