import { type WebSocket, WebSocketServer } from 'ws';
import {
  type ClientMessage,
  DEFAULT_WS_HOST,
  DEFAULT_WS_PORT,
  MAX_FRAME_BYTES,
  type RejectReason,
  type ServerMessage,
  type StoredEntry,
  WS_PORT_ENV,
} from '../shared/protocol.js';
import { ProtocolError, parseClientMessage } from './protocol.js';
import { SessionRegistry } from './session.js';
import { DEFAULT_STORE_LIMITS, LogStore, type StoreLimits } from './store.js';

export interface LogServerOptions {
  token: string;
  port?: number;
  host?: string;
  limits?: StoreLimits;
  log?: (line: string) => void;
  now?: () => number;
  environment?: string;
  allowProduction?: boolean;
  allowNonLoopback?: boolean;
}

export const ALLOW_PRODUCTION_ENV = 'KAKAO_DEVTOOLS_ALLOW_PRODUCTION';

export function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '::1' || host === '[::1]' || /^127\./.test(host);
}

/**
 * Loopback is the default and is sufficient for tunnels. A non-loopback bind is
 * refused unless it is requested explicitly (ARCHITECTURE.md section 6).
 */
export function checkBindPolicy(options: {
  host: string;
  allowNonLoopback: boolean;
  log: (line: string) => void;
}): void {
  if (isLoopbackHost(options.host)) {
    return;
  }

  if (!options.allowNonLoopback) {
    options.log(`[kakao-devtools] refusing to bind to non-loopback host ${options.host}`);
    throw new Error(
      `Refusing to bind to non-loopback host ${options.host}. Tunnels forward to 127.0.0.1, so a non-loopback bind needs allowNonLoopback.`,
    );
  }

  options.log(
    `[kakao-devtools] warning: listening on non-loopback host ${options.host} without authentication`,
  );
}

export interface LogServer {
  readonly host: string;
  readonly port: number;
  readonly url: string;
  readonly store: LogStore;
  readonly sessions: SessionRegistry;
  close(): Promise<void>;
}

/** Reads the receiver port from the environment, falling back to 7890. */
export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[WS_PORT_ENV];
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_WS_PORT;
  }

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`${WS_PORT_ENV} must be a port number, received ${JSON.stringify(raw)}`);
  }
  return port;
}

function portInUseError(port: number): Error {
  return new Error(
    `Cannot start the Kakao devtools log server: port ${port} is already in use. Set ${WS_PORT_ENV} to a free port.`,
  );
}

function toStoredEntry(
  sessionId: string,
  message: Exclude<ClientMessage, { type: 'hello' | 'ping' }>,
): StoredEntry {
  switch (message.type) {
    case 'log':
      return {
        sessionId,
        kind: 'log',
        seq: message.seq,
        ts: message.ts,
        level: message.level,
        args: message.args,
      };
    case 'error':
      return {
        sessionId,
        kind: 'error',
        seq: message.seq,
        ts: message.ts,
        message: message.message,
        stack: message.stack,
        source: message.source,
      };
    case 'sdk_error':
      return {
        sessionId,
        kind: 'sdk_error',
        seq: message.seq,
        ts: message.ts,
        api: message.api,
        code: message.code,
        raw: message.raw,
        explanation: message.explanation,
      };
    case 'event':
      return {
        sessionId,
        kind: 'event',
        seq: message.seq,
        ts: message.ts,
        name: message.name,
        detail: message.detail,
      };
  }
}

export async function startLogServer(options: LogServerOptions): Promise<LogServer> {
  const host = options.host ?? DEFAULT_WS_HOST;
  const port = options.port ?? resolvePort();
  const store = new LogStore(options.limits ?? DEFAULT_STORE_LIMITS);
  const sessions = new SessionRegistry();
  const log = options.log ?? ((line: string) => process.stderr.write(`${line}\n`));
  const now = options.now ?? Date.now;
  const environment = options.environment ?? process.env.NODE_ENV ?? '';
  const allowProduction =
    options.allowProduction ?? (process.env[ALLOW_PRODUCTION_ENV] ?? '') !== '';
  const isProduction = environment === 'production';

  checkBindPolicy({ host, allowNonLoopback: options.allowNonLoopback ?? false, log });

  const wss = new WebSocketServer({ host, port, maxPayload: MAX_FRAME_BYTES });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      wss.off('listening', onListening);
      reject(error.code === 'EADDRINUSE' ? portInUseError(port) : error);
    };
    const onListening = () => {
      wss.off('error', onError);
      resolve();
    };

    wss.once('error', onError);
    wss.once('listening', onListening);
  });

  const address = wss.address();
  const listeningPort = typeof address === 'object' && address !== null ? address.port : port;

  wss.on('error', (error) => log(`[kakao-devtools] server error: ${String(error)}`));

  wss.on('connection', (socket: WebSocket) => {
    let sessionId: string | undefined;

    const send = (message: ServerMessage): void => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    };

    const reject = (reason: RejectReason): void => {
      send({ type: 'reject', reason });
      socket.close();
    };

    socket.on('message', (data) => {
      const text = data.toString();

      let message: ClientMessage;
      try {
        message = parseClientMessage(text);
      } catch (error) {
        if (error instanceof ProtocolError) {
          if (error.code === 'bad_version') {
            reject('bad_version');
          } else {
            log(`[kakao-devtools] dropped invalid frame: ${error.message}`);
            socket.close(1002, 'protocol error');
          }
          return;
        }
        throw error;
      }

      if (sessionId === undefined) {
        if (message.type !== 'hello') {
          log('[kakao-devtools] dropped frame before hello');
          socket.close(1002, 'hello expected');
          return;
        }

        if (message.token !== options.token) {
          log('[kakao-devtools] rejected a session with a bad token');
          reject('bad_token');
          return;
        }

        if (isProduction && !allowProduction) {
          log(
            `[kakao-devtools] refused a session in a production environment; set ${ALLOW_PRODUCTION_ENV} to override`,
          );
          reject('disabled');
          return;
        }

        sessionId = message.sessionId;
        sessions.connect({ sessionId, ua: message.ua, url: message.url, now: now() });
        log(
          `[kakao-devtools] session ${sessionId} connected (${sessions.get(sessionId)?.platform ?? 'other'})`,
        );

        const ackSeq = sessions.lastSeq(sessionId);
        if (message.lastAckedSeq > ackSeq) {
          log(
            `[kakao-devtools] session ${sessionId} announces seq ${message.lastAckedSeq} but only ${ackSeq} is stored`,
          );
        }
        send({ type: 'welcome', ackSeq });
        return;
      }

      if (message.type === 'hello') {
        socket.close(1002, 'duplicate hello');
        return;
      }

      if (message.type === 'ping') {
        send({ type: 'pong' });
        return;
      }

      if (message.seq <= sessions.lastSeq(sessionId)) {
        send({ type: 'ack', ackSeq: sessions.lastSeq(sessionId) });
        return;
      }

      store.append(sessionId, toStoredEntry(sessionId, message));
      sessions.recordSeq(sessionId, message.seq);
      sessions.touch(sessionId, now());
      send({ type: 'ack', ackSeq: sessions.lastSeq(sessionId) });
    });

    socket.on('close', () => {
      if (sessionId !== undefined) {
        sessions.disconnect(sessionId, now());
      }
    });
  });

  return {
    host,
    port: listeningPort,
    url: `ws://${host}:${listeningPort}`,
    store,
    sessions,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const client of wss.clients) {
          client.close();
        }
        wss.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
