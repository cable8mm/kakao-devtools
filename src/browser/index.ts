import { shouldActivate } from './activation.js';
import { type CaptureTarget, installCapture } from './capture.js';
import { buildDestination, CONFIG_GLOBAL, type SnippetConfig } from './config.js';
import { type ResumeTarget, WsClient } from './ws-client.js';

export interface InitOptions {
  config: SnippetConfig;
  ua: string;
  url: string;
  random?: () => number;
  now?: () => number;
}

export function createSessionId(
  random: () => number = Math.random,
  now: () => number = Date.now,
): string {
  const stamp = now().toString(36);
  const suffix = Math.floor(random() * 1_000_000_000).toString(36);
  return `s-${stamp}-${suffix}`;
}

/**
 * Wires capture and log delivery. Returns a teardown function, or null when the
 * snippet is not active, so a host page can disable it without side effects.
 */
export function init(options: InitOptions): (() => void) | null {
  if (!shouldActivate(options.ua, options.config.enabled)) {
    return null;
  }

  const resumeTarget = (typeof document === 'undefined' ? null : document) as ResumeTarget | null;

  const client = new WsClient({
    destination: buildDestination(options.config.ws),
    token: options.config.token,
    sessionId: options.config.sessionId ?? createSessionId(options.random, options.now),
    ua: options.ua,
    url: options.url,
    queue: options.config.queue,
    backoff: options.config.backoff,
    resumeTarget,
  });

  const target = globalThis as unknown as CaptureTarget;
  const uninstall = installCapture(target, (payload) => {
    client.enqueue(payload);
  });

  client.start();

  return () => {
    uninstall();
    client.stop();
  };
}

function autoInit(): void {
  try {
    const config = (globalThis as unknown as Record<string, unknown>)[CONFIG_GLOBAL] as
      | SnippetConfig
      | undefined;
    if (!config) {
      return;
    }
    const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    const url = typeof location === 'undefined' ? '' : location.href;
    init({ config, ua, url });
  } catch {
    // The snippet must never break the host page.
  }
}

autoInit();
