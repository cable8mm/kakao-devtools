import { PROTOCOL_VERSION, type ServerMessage } from '../shared/protocol.js';
import type { CapturedPayload } from './capture.js';
import type { ResolvedDestination } from './config.js';
import { DEFAULT_QUEUE_LIMITS, MessageQueue, type QueueLimits } from './queue.js';

export type ClientState = 'idle' | 'connecting' | 'open' | 'rejected' | 'stopped';

/** The part of the browser WebSocket API the client uses. */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface ResumeTarget {
  addEventListener(type: 'visibilitychange' | 'pageshow' | 'online', listener: () => void): void;
  removeEventListener(type: 'visibilitychange' | 'pageshow' | 'online', listener: () => void): void;
  visibilityState?: string;
}

export interface BackoffOptions {
  initialMs?: number;
  maxMs?: number;
}

export interface WsClientOptions {
  destination: ResolvedDestination;
  token: string;
  sessionId: string;
  ua: string;
  url: string;
  queue?: Partial<QueueLimits>;
  backoff?: BackoffOptions;
  socketFactory?: (url: string) => SocketLike;
  now?: () => number;
  random?: () => number;
  resumeTarget?: ResumeTarget | null;
}

const SOCKET_OPEN = 1;
const DEFAULT_BACKOFF = { initialMs: 500, maxMs: 10_000 };

function defaultSocketFactory(url: string): SocketLike {
  return new WebSocket(url) as unknown as SocketLike;
}

/**
 * Sends captured entries to the log server. Frames are numbered, kept in a bounded
 * queue until acknowledged, and resent from `lastAckedSeq` after a reconnect.
 */
export class WsClient {
  private readonly options: WsClientOptions;
  private readonly queue: MessageQueue;
  private readonly backoff: { initialMs: number; maxMs: number };
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly socketFactory: (url: string) => SocketLike;

  private seq = 0;
  private acked = 0;
  private sentUpTo = 0;
  private attempt = 0;
  private stateValue: ClientState = 'idle';
  private socket: SocketLike | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: WsClientOptions) {
    this.options = options;
    this.queue = new MessageQueue(options.queue ?? DEFAULT_QUEUE_LIMITS);
    this.backoff = { ...DEFAULT_BACKOFF, ...options.backoff };
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.socketFactory = options.socketFactory ?? defaultSocketFactory;
  }

  get state(): ClientState {
    return this.stateValue;
  }

  get lastAckedSeq(): number {
    return this.acked;
  }

  enqueue(payload: CapturedPayload): void {
    if (this.stateValue === 'stopped' || this.stateValue === 'rejected') {
      return;
    }

    this.seq += 1;
    const ts = this.now();
    const message =
      payload.type === 'log'
        ? { type: 'log' as const, seq: this.seq, ts, level: payload.level, args: payload.args }
        : {
            type: 'error' as const,
            seq: this.seq,
            ts,
            message: payload.message,
            stack: payload.stack,
            source: payload.source,
          };

    const frame = JSON.stringify(message);
    this.queue.push({ seq: this.seq, frame, bytes: frame.length });
    this.reportDropped();

    if (this.stateValue === 'open') {
      this.flush();
    }
  }

  start(): void {
    if (this.stateValue !== 'idle') {
      return;
    }
    this.listenForResume();
    this.connect();
  }

  stop(): void {
    this.removeResumeListeners();
    this.stateValue = 'stopped';
    this.clearRetry();
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.close();
    }
  }

  private reportDropped(): void {
    const dropped = this.queue.takeDropped();
    if (dropped === 0) {
      return;
    }

    this.seq += 1;
    const frame = JSON.stringify({
      type: 'event',
      seq: this.seq,
      ts: this.now(),
      name: 'dropped',
      detail: { count: dropped },
    });
    this.queue.push({ seq: this.seq, frame, bytes: frame.length });
  }

  private connect(): void {
    this.clearRetry();
    this.stateValue = 'connecting';

    let socket: SocketLike;
    try {
      socket = this.socketFactory(this.options.destination.url);
    } catch {
      this.scheduleRetry();
      return;
    }

    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.sentUpTo = 0;
      this.stateValue = 'open';
      this.sendHello(socket);
      this.flush();
    };

    socket.onmessage = (event) => {
      this.handleServerMessage(event.data);
    };

    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null;
      }
      if (this.stateValue === 'open' || this.stateValue === 'connecting') {
        this.scheduleRetry();
      }
    };

    socket.onerror = () => {
      // onclose follows; retry scheduling happens there.
    };
  }

  private sendHello(socket: SocketLike): void {
    try {
      socket.send(
        JSON.stringify({
          type: 'hello',
          v: PROTOCOL_VERSION,
          token: this.options.token,
          sessionId: this.options.sessionId,
          ua: this.options.ua,
          url: this.options.url,
          lastAckedSeq: this.acked,
        }),
      );
    } catch {
      socket.close();
    }
  }

  private flush(): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== SOCKET_OPEN) {
      return;
    }

    for (const item of this.queue.pending()) {
      if (item.seq <= this.sentUpTo) {
        continue;
      }
      try {
        socket.send(item.frame);
      } catch {
        return;
      }
      this.sentUpTo = item.seq;
    }
  }

  private handleServerMessage(raw: string): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }

    switch (message.type) {
      case 'welcome':
      case 'ack': {
        if (message.ackSeq > this.acked) {
          this.acked = message.ackSeq;
        }
        this.queue.ack(this.acked);
        this.sentUpTo = Math.max(this.sentUpTo, this.acked);
        this.flush();
        return;
      }
      case 'reject': {
        this.stateValue = 'rejected';
        this.clearRetry();
        this.removeResumeListeners();
        this.socket?.close();
        this.socket = null;
        return;
      }
      case 'pong':
        return;
    }
  }

  private scheduleRetry(): void {
    if (this.stateValue === 'stopped' || this.stateValue === 'rejected' || this.retryTimer) {
      return;
    }

    this.attempt += 1;
    const exponential = this.backoff.initialMs * 2 ** (this.attempt - 1);
    const capped = Math.min(exponential, this.backoff.maxMs);
    const jitter = 0.8 + this.random() * 0.4;
    this.stateValue = 'connecting';

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, capped * jitter);
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private listenForResume(): void {
    const target = this.options.resumeTarget;
    if (target) {
      target.addEventListener('visibilitychange', this.onResume);
      target.addEventListener('pageshow', this.onResume);
      target.addEventListener('online', this.onResume);
    }
  }

  private removeResumeListeners(): void {
    const target = this.options.resumeTarget;
    if (target) {
      target.removeEventListener('visibilitychange', this.onResume);
      target.removeEventListener('pageshow', this.onResume);
      target.removeEventListener('online', this.onResume);
    }
  }

  private readonly onResume = (): void => {
    if (
      this.stateValue === 'open' ||
      this.stateValue === 'stopped' ||
      this.stateValue === 'rejected'
    ) {
      return;
    }
    this.attempt = 0;
    this.connect();
  };
}
