#!/usr/bin/env node
import { parseArgs } from 'node:util';
import type { WsScheme } from '../shared/protocol.js';
import { CONFIG_FILE, initProject, PAGE_FILE, SNIPPET_FILE } from './init.js';

const USAGE = `kakao-devtools-cli

Usage:
  kakao-devtools-cli init [--host <host>] [--port <port>] [--scheme ws|wss]

Writes ${CONFIG_FILE}, ${SNIPPET_FILE} and ${PAGE_FILE} into the current directory.
The ws destination is where the phone reaches this machine: a tunnel endpoint.
`;

function fail(message: string): number {
  process.stderr.write(`${message}\n\n${USAGE}`);
  return 1;
}

async function main(argv: string[]): Promise<number> {
  if (argv.length === 0) {
    return fail('missing command');
  }

  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        host: { type: 'string' },
        port: { type: 'string' },
        scheme: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  const { positionals, values } = parsed;

  if (values.help === true) {
    process.stdout.write(USAGE);
    return 0;
  }

  if (positionals[0] !== 'init') {
    return fail(`unknown command ${JSON.stringify(positionals[0] ?? '')}`);
  }

  const host = typeof values.host === 'string' ? values.host : undefined;
  const scheme = values.scheme;
  if (scheme !== undefined && scheme !== 'ws' && scheme !== 'wss') {
    return fail(`--scheme must be "ws" or "wss", received ${JSON.stringify(scheme)}`);
  }

  const rawPort = values.port;
  const port = rawPort === undefined ? undefined : Number(rawPort);
  if (rawPort !== undefined && (!Number.isInteger(port) || (port as number) <= 0)) {
    return fail(`--port must be a port number, received ${JSON.stringify(rawPort)}`);
  }

  try {
    const result = await initProject({
      cwd: process.cwd(),
      host,
      port,
      scheme: scheme as WsScheme | undefined,
      environment: process.env.NODE_ENV,
    });

    process.stdout.write(
      [
        `kakao-devtools is scaffolded in ${process.cwd()}`,
        `  config:  ${CONFIG_FILE} (activation ${result.config.enabled ? 'enabled' : 'disabled'}, token ${result.reusedToken ? 'reused' : 'generated'})`,
        `  snippet: ${SNIPPET_FILE}`,
        `  page:    ${PAGE_FILE}`,
        `  ws:      ${result.config.ws.scheme}://${result.config.ws.host}:${result.config.ws.port}`,
        `  token:   ${result.config.token}`,
        '',
        'Open the page in the KakaoTalk in-app browser and start the MCP server with the token above.',
        '',
      ].join('\n'),
    );
    return 0;
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

process.exitCode = await main(process.argv.slice(2));
