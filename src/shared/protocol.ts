export const PROTOCOL_VERSION = 1;

export const DEFAULT_WS_HOST = '127.0.0.1';
export const DEFAULT_WS_PORT = 7890;
export const WS_PORT_ENV = 'KAKAO_DEVTOOLS_WS_PORT';

export type LogLevel = 'debug' | 'log' | 'info' | 'warn' | 'error';

export type WsScheme = 'ws' | 'wss';

export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'log', 'info', 'warn', 'error'];

export const MAX_FRAME_BYTES = 1_000_000;

export interface HelloMessage {
  type: 'hello';
  v: number;
  token: string;
  sessionId: string;
  ua: string;
  url: string;
  lastAckedSeq: number;
}

export interface LogMessage {
  type: 'log';
  seq: number;
  ts: number;
  level: LogLevel;
  args: unknown[];
}

export interface ErrorMessage {
  type: 'error';
  seq: number;
  ts: number;
  message: string;
  stack?: string;
  source?: string;
}

export interface SdkErrorMessage {
  type: 'sdk_error';
  seq: number;
  ts: number;
  api: string;
  code?: string | number;
  raw: unknown;
  explanation?: string;
}

export interface EventMessage {
  type: 'event';
  seq: number;
  ts: number;
  name: string;
  detail?: unknown;
}

export interface PingMessage {
  type: 'ping';
}

export type ClientMessage =
  | HelloMessage
  | LogMessage
  | ErrorMessage
  | SdkErrorMessage
  | EventMessage
  | PingMessage;

export type StoredMessageType = 'log' | 'error' | 'sdk_error' | 'event';

export interface StoredEntry {
  sessionId: string;
  kind: StoredMessageType;
  seq: number;
  ts: number;
  level?: LogLevel;
  args?: unknown[];
  message?: string;
  stack?: string;
  source?: string;
  api?: string;
  code?: string | number;
  raw?: unknown;
  explanation?: string;
  name?: string;
  detail?: unknown;
}

export interface WelcomeMessage {
  type: 'welcome';
  ackSeq: number;
}

export interface AckMessage {
  type: 'ack';
  ackSeq: number;
}

export interface PongMessage {
  type: 'pong';
}

export type RejectReason = 'bad_token' | 'bad_version' | 'disabled';

export interface RejectMessage {
  type: 'reject';
  reason: RejectReason;
}

export type ServerMessage = WelcomeMessage | AckMessage | RejectMessage | PongMessage;
