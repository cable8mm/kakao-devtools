import { type AddressInfo, createServer as createNetServer } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDestination } from '../../src/browser/config.js';
import { WsClient } from '../../src/browser/ws-client.js';
import { startLogServerOrExit } from '../../src/core/run.js';
import { type LogServer, resolvePort, startLogServer } from '../../src/core/server.js';
import type { ServerMessage } from '../../src/shared/protocol.js';
import { PROTOCOL_VERSION, WS_PORT_ENV } from '../../src/shared/protocol.js';

const TOKEN = 'test-token';
const noop = (): void => {};

const servers: LogServer[] = [];
const clients: WsClient[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) {
    client.stop();
  }
  for (const server of servers.splice(0)) {
    await server.close();
  }
});

async function startServer(options: Parameters<typeof startLogServer>[0]): Promise<LogServer> {
  const server = await startLogServer(options);
  servers.push(server);
  return server;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('timed out while waiting for a condition');
    }
    await sleep(10);
  }
}

function createClient(
  port: number,
  overrides: Partial<ConstructorParameters<typeof WsClient>[0]> = {},
): WsClient {
  const client = new WsClient({
    destination: buildDestination({ host: '127.0.0.1', port }),
    token: TOKEN,
    sessionId: 's-1',
    ua: 'Mozilla/5.0 (Linux; Android 14) KAKAOTALK 25.4.0',
    url: 'https://example.test/',
    backoff: { initialMs: 20, maxMs: 50 },
    ...overrides,
  });
  clients.push(client);
  return client;
}

async function connectRaw(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error('raw socket did not open')), 2_000);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('raw socket failed'));
    });
  });
}

function nextMessages(socket: WebSocket, count: number): Promise<ServerMessage[]> {
  return new Promise((resolve, reject) => {
    const received: ServerMessage[] = [];
    const timer = setTimeout(() => {
      socket.removeEventListener('message', onMessage);
      reject(new Error(`expected ${count} messages, received ${received.length}`));
    }, 2_000);

    const onMessage = (event: MessageEvent) => {
      received.push(JSON.parse(String(event.data)) as ServerMessage);
      if (received.length === count) {
        clearTimeout(timer);
        socket.removeEventListener('message', onMessage);
        resolve(received);
      }
    };

    socket.addEventListener('message', onMessage);
  });
}

const helloFrame = {
  type: 'hello',
  v: PROTOCOL_VERSION,
  token: TOKEN,
  sessionId: 's-1',
  ua: 'Mozilla/5.0 (Linux; Android 14) KAKAOTALK 25.4.0',
  url: 'https://example.test/',
  lastAckedSeq: 0,
};

describe('log server', () => {
  it('stores a console message and an uncaught error in emission order', async () => {
    const server = await startServer({ token: TOKEN, port: 0, log: noop });
    const client = createClient(server.port);
    client.start();
    await waitFor(() => client.state === 'open');

    client.enqueue({ type: 'log', level: 'warn', args: ['hello', { ok: true }] });
    client.enqueue({ type: 'error', message: 'probe failure', stack: 'Error: probe failure' });

    await waitFor(() => server.store.entries('s-1').length === 2);

    const [log, error] = server.store.entries('s-1');
    expect(log).toMatchObject({
      kind: 'log',
      level: 'warn',
      args: ['hello', { ok: true }],
      sessionId: 's-1',
    });
    expect(error).toMatchObject({
      kind: 'error',
      message: 'probe failure',
      stack: 'Error: probe failure',
    });
    expect(log?.seq).toBe(1);
    expect(error?.seq).toBe(2);
    expect(typeof log?.ts).toBe('number');
    expect(server.sessions.get('s-1')?.platform).toBe('android');
  });

  it('rejects a wrong token and stops retrying', async () => {
    const server = await startServer({ token: TOKEN, port: 0, log: noop });
    const client = createClient(server.port, { token: 'wrong-token' });
    client.start();

    await waitFor(() => client.state === 'rejected');
    client.enqueue({ type: 'log', level: 'log', args: ['never stored'] });

    await sleep(200);

    expect(client.state).toBe('rejected');
    expect(server.sessions.list()).toEqual([]);
    expect(server.store.entries()).toEqual([]);
  });

  it('rejects a hello from another protocol version', async () => {
    const server = await startServer({ token: TOKEN, port: 0, log: noop });
    const socket = await connectRaw(server.url);
    const replies = nextMessages(socket, 1);

    socket.send(JSON.stringify({ ...helloFrame, v: 99 }));

    await expect(replies).resolves.toEqual([{ type: 'reject', reason: 'bad_version' }]);
    socket.close();
  });

  it('answers a reconnecting session with the highest stored sequence', async () => {
    const server = await startServer({ token: TOKEN, port: 0, log: noop });
    const first = await connectRaw(server.url);
    const welcome = nextMessages(first, 1);
    first.send(JSON.stringify(helloFrame));
    await expect(welcome).resolves.toEqual([{ type: 'welcome', ackSeq: 0 }]);

    const ack = nextMessages(first, 1);
    first.send(JSON.stringify({ type: 'log', seq: 1, ts: 1, level: 'log', args: ['first'] }));
    await expect(ack).resolves.toEqual([{ type: 'ack', ackSeq: 1 }]);
    first.close();

    await waitFor(() => server.sessions.lastSeq('s-1') === 1);

    const second = await connectRaw(server.url);
    const reWelcome = nextMessages(second, 1);
    second.send(JSON.stringify({ ...helloFrame, lastAckedSeq: 0 }));

    await expect(reWelcome).resolves.toEqual([{ type: 'welcome', ackSeq: 1 }]);
    second.close();
  });

  it('deduplicates a frame that is resent with the same sequence', async () => {
    const server = await startServer({ token: TOKEN, port: 0, log: noop });
    const socket = await connectRaw(server.url);
    const welcome = nextMessages(socket, 1);
    socket.send(JSON.stringify(helloFrame));
    await welcome;

    const firstAck = nextMessages(socket, 1);
    const frame = JSON.stringify({ type: 'log', seq: 1, ts: 1, level: 'log', args: ['once'] });
    socket.send(frame);
    await expect(firstAck).resolves.toEqual([{ type: 'ack', ackSeq: 1 }]);

    const secondAck = nextMessages(socket, 1);
    socket.send(frame);
    await expect(secondAck).resolves.toEqual([{ type: 'ack', ackSeq: 1 }]);

    expect(server.store.entries('s-1')).toHaveLength(1);
    socket.close();
  });

  it('delivers entries queued before the server starts', async () => {
    const probe = await startLogServer({ token: TOKEN, port: 0, log: noop });
    const port = probe.port;
    await probe.close();

    const client = createClient(port);
    client.enqueue({ type: 'log', level: 'log', args: ['queued before start'] });
    client.start();

    await sleep(120);
    const server = await startServer({ token: TOKEN, port, log: noop });

    await waitFor(() => server.store.entries('s-1').length === 1);
    expect(server.store.entries('s-1')[0]?.args).toEqual(['queued before start']);
  });

  it('drops the oldest entry when the per-session cap is exceeded', async () => {
    const server = await startServer({
      token: TOKEN,
      port: 0,
      log: noop,
      limits: { maxEntries: 2, maxBytes: 1_000_000 },
    });
    const client = createClient(server.port);
    client.start();
    await waitFor(() => client.state === 'open');

    for (let seq = 1; seq <= 3; seq += 1) {
      client.enqueue({ type: 'log', level: 'log', args: [seq] });
    }

    await waitFor(() => server.store.entries('s-1').length === 2);
    expect(server.store.entries('s-1').map((entry) => entry.seq)).toEqual([2, 3]);
  });

  it('names the port and the environment variable when the port is taken', async () => {
    const first = await startServer({ token: TOKEN, port: 0, log: noop });

    await expect(startLogServer({ token: TOKEN, port: first.port, log: noop })).rejects.toThrow(
      new RegExp(`port ${first.port} is already in use.*${WS_PORT_ENV}`),
    );
  });
});

describe('resolvePort', () => {
  it('defaults to 7890', () => {
    expect(resolvePort({})).toBe(7890);
  });

  it('reads the configured override', () => {
    expect(resolvePort({ [WS_PORT_ENV]: '8123' })).toBe(8123);
  });

  it('rejects an invalid value', () => {
    expect(() => resolvePort({ [WS_PORT_ENV]: 'http' })).toThrow(WS_PORT_ENV);
    expect(() => resolvePort({ [WS_PORT_ENV]: '70000' })).toThrow(WS_PORT_ENV);
  });
});

describe('startLogServerOrExit', () => {
  it('reports a port conflict on stderr and exits with code 1', async () => {
    const blocker = createNetServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const port = (blocker.address() as AddressInfo).port;

    const lines: string[] = [];
    const exit = vi.fn((code: number): never => {
      throw new Error(`exit ${code}`);
    });

    await expect(
      startLogServerOrExit(
        { token: TOKEN, port },
        { exit, writeError: (line) => lines.push(line) },
      ),
    ).rejects.toThrow('exit 1');

    expect(exit).toHaveBeenCalledWith(1);
    expect(lines.join('\n')).toMatch(new RegExp(`port ${port} is already in use.*${WS_PORT_ENV}`));

    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  });
});
