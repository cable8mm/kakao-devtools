import type { LogLevel } from '../shared/protocol.js';
import { DEFAULT_SERIALIZE_LIMITS, type SerializeLimits, serializeArgs } from './serialize.js';

export type CapturedPayload =
  | { type: 'log'; level: LogLevel; args: unknown[] }
  | { type: 'error'; message: string; stack?: string; source?: string };

export type CaptureSink = (payload: CapturedPayload) => void;

export type ConsoleFn = (...args: unknown[]) => void;

export type ConsoleLike = Record<LogLevel, ConsoleFn | undefined>;

export interface ErrorEventLike {
  message?: string;
  error?: unknown;
  filename?: string;
  lineno?: number;
}

export interface RejectionEventLike {
  reason?: unknown;
}

export interface CaptureTarget {
  console: ConsoleLike;
  addEventListener(type: 'error' | 'unhandledrejection', listener: (event: never) => void): void;
  removeEventListener(type: 'error' | 'unhandledrejection', listener: (event: never) => void): void;
}

const CONSOLE_LEVELS: LogLevel[] = ['debug', 'log', 'info', 'warn', 'error'];

function describeError(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error) {
    return { message: reason.message, stack: reason.stack };
  }
  return { message: String(reason) };
}

function sourceOf(event: ErrorEventLike): string | undefined {
  if (event.filename === undefined) {
    return undefined;
  }
  return event.lineno === undefined ? event.filename : `${event.filename}:${event.lineno}`;
}

/**
 * Hooks console output, uncaught errors and unhandled rejections. Every hook is
 * guarded so a failure inside the tool never changes the host page's behavior.
 */
export function installCapture(
  target: CaptureTarget,
  sink: CaptureSink,
  limits: SerializeLimits = DEFAULT_SERIALIZE_LIMITS,
): () => void {
  const originals = new Map<LogLevel, ConsoleFn>();

  for (const level of CONSOLE_LEVELS) {
    const original = target.console[level];
    if (typeof original !== 'function') {
      continue;
    }

    originals.set(level, original);
    target.console[level] = (...args: unknown[]) => {
      try {
        sink({ type: 'log', level, args: serializeArgs(args, limits) });
      } catch {
        // Never let the tool break the page.
      }
      original.apply(target.console, args);
    };
  }

  const onError = (event: ErrorEventLike) => {
    try {
      const described = typeof event.error === 'undefined' ? undefined : describeError(event.error);
      sink({
        type: 'error',
        message: event.message ?? described?.message ?? 'Uncaught error',
        stack: described?.stack,
        source: sourceOf(event),
      });
    } catch {
      // Never let the tool break the page.
    }
  };

  const onRejection = (event: RejectionEventLike) => {
    try {
      const described = describeError(event.reason);
      sink({
        type: 'error',
        message: `Unhandled rejection: ${described.message}`,
        stack: described.stack,
      });
    } catch {
      // Never let the tool break the page.
    }
  };

  const hasListeners = typeof target.addEventListener === 'function';

  if (hasListeners) {
    target.addEventListener('error', onError as (event: never) => void);
    target.addEventListener('unhandledrejection', onRejection as (event: never) => void);
  }

  return () => {
    for (const [level, original] of originals) {
      target.console[level] = original;
    }
    if (hasListeners) {
      target.removeEventListener('error', onError as (event: never) => void);
      target.removeEventListener('unhandledrejection', onRejection as (event: never) => void);
    }
  };
}
