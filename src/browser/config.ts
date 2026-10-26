import { DEFAULT_WS_HOST, DEFAULT_WS_PORT, type WsScheme } from '../shared/protocol.js';

export type { WsScheme };

export interface WsDestinationConfig {
  host?: string;
  port?: number;
  scheme?: WsScheme;
}

export interface SnippetConfig {
  enabled: boolean;
  token: string;
  ws?: WsDestinationConfig;
  sessionId?: string;
  queue?: { maxMessages?: number; maxBytes?: number };
  backoff?: { initialMs?: number; maxMs?: number };
}

export interface ResolvedDestination {
  url: string;
  scheme: WsScheme;
  host: string;
  port: number;
}

export const CONFIG_GLOBAL = '__KAKAO_DEVTOOLS__';

/**
 * Builds the WebSocket URL the snippet connects to. The destination is configured
 * separately from the local receiver port, so a tunnel endpoint can be used.
 */
export function buildDestination(config: WsDestinationConfig = {}): ResolvedDestination {
  const scheme = config.scheme ?? 'ws';
  if (scheme !== 'ws' && scheme !== 'wss') {
    throw new Error(`ws.scheme must be "ws" or "wss", received ${JSON.stringify(scheme)}`);
  }

  const host = config.host ?? DEFAULT_WS_HOST;
  if (typeof host !== 'string' || host.trim() === '') {
    throw new Error('ws.host must be a non-empty string');
  }

  const port = config.port ?? DEFAULT_WS_PORT;
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`ws.port must be a port number, received ${JSON.stringify(port)}`);
  }

  return { url: `${scheme}://${host}:${port}`, scheme, host, port };
}
