import {
  type ClientMessage,
  LOG_LEVELS,
  type LogLevel,
  MAX_FRAME_BYTES,
  PROTOCOL_VERSION,
} from '../shared/protocol.js';

export type ProtocolErrorCode = 'bad_version' | 'invalid';

export class ProtocolError extends Error {
  readonly code: ProtocolErrorCode;

  constructor(message: string, code: ProtocolErrorCode = 'invalid') {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
  }
}

function invalid(message: string): never {
  throw new ProtocolError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    invalid(`${field} must be an object`);
  }
  return value;
}

function readString(value: unknown, field: string, maxLength = 10_000): string {
  if (typeof value !== 'string') {
    invalid(`${field} must be a string`);
  }
  if (value.length > maxLength) {
    invalid(`${field} is longer than ${maxLength} characters`);
  }
  return value;
}

function readOptionalString(
  value: unknown,
  field: string,
  maxLength = 100_000,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return readString(value, field, maxLength);
}

function readSeq(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalid(`${field} must be a non-negative integer`);
  }
  return value;
}

function readTimestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    invalid('ts must be a non-negative number');
  }
  return value;
}

function readLevel(value: unknown): LogLevel {
  if (typeof value !== 'string' || !LOG_LEVELS.includes(value as LogLevel)) {
    invalid(`level must be one of ${LOG_LEVELS.join(', ')}`);
  }
  return value as LogLevel;
}

function readArgs(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    invalid('args must be an array');
  }
  if (value.length > 100) {
    invalid('args must hold at most 100 entries');
  }
  return value;
}

function readCode(value: unknown): string | number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) {
    return value;
  }
  return invalid('code must be a string or a number');
}

/** Parses and validates one WebSocket text frame sent by the snippet. */
export function parseClientMessage(raw: string): ClientMessage {
  if (raw.length > MAX_FRAME_BYTES) {
    throw new ProtocolError('frame is too large');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new ProtocolError('frame is not valid JSON');
  }

  const message = readRecord(decoded, 'message');

  switch (message.type) {
    case 'hello': {
      if (message.v !== PROTOCOL_VERSION) {
        throw new ProtocolError(`unsupported protocol version ${String(message.v)}`, 'bad_version');
      }
      readSeq(message.lastAckedSeq, 'lastAckedSeq');
      return {
        type: 'hello',
        v: PROTOCOL_VERSION,
        token: readString(message.token, 'token', 500),
        sessionId: readString(message.sessionId, 'sessionId', 200),
        ua: readString(message.ua, 'ua', 2_000),
        url: readString(message.url, 'url', 10_000),
        lastAckedSeq: readSeq(message.lastAckedSeq, 'lastAckedSeq'),
      };
    }

    case 'log':
      return {
        type: 'log',
        seq: readSeq(message.seq, 'seq'),
        ts: readTimestamp(message.ts),
        level: readLevel(message.level),
        args: readArgs(message.args),
      };

    case 'error':
      return {
        type: 'error',
        seq: readSeq(message.seq, 'seq'),
        ts: readTimestamp(message.ts),
        message: readString(message.message, 'message'),
        stack: readOptionalString(message.stack, 'stack'),
        source: readOptionalString(message.source, 'source', 10_000),
      };

    case 'sdk_error':
      return {
        type: 'sdk_error',
        seq: readSeq(message.seq, 'seq'),
        ts: readTimestamp(message.ts),
        api: readString(message.api, 'api', 500),
        code: readCode(message.code),
        raw: message.raw,
        explanation: readOptionalString(message.explanation, 'explanation'),
      };

    case 'event':
      return {
        type: 'event',
        seq: readSeq(message.seq, 'seq'),
        ts: readTimestamp(message.ts),
        name: readString(message.name, 'name', 200),
        detail: message.detail,
      };

    case 'ping':
      return { type: 'ping' };

    default:
      return invalid(`unknown message type ${JSON.stringify(message.type)}`);
  }
}
