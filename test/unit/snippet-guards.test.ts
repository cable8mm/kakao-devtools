import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { init } from '../../src/browser/index.js';

const KAKAO_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S918N; wv) AppleWebKit/537.36 KAKAOTALK/25.4.0 Chrome/126.0 Mobile';
const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 Chrome/126.0 Mobile';

class CountingSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  static created = 0;

  constructor() {
    CountingSocket.created += 1;
  }

  send(): void {}

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

const originalConsoleLog = console.log;
const originalWebSocket = globalThis.WebSocket;

beforeEach(() => {
  CountingSocket.created = 0;
  globalThis.WebSocket = CountingSocket as unknown as typeof WebSocket;
});

afterEach(() => {
  console.log = originalConsoleLog;
  globalThis.WebSocket = originalWebSocket;
});

describe('snippet activation guards', () => {
  it('installs nothing in a browser that is not KakaoTalk', () => {
    const teardown = init({
      config: { enabled: true, token: 'token' },
      ua: CHROME_UA,
      url: 'https://example.test/',
    });

    expect(teardown).toBeNull();
    expect(CountingSocket.created).toBe(0);
    expect(console.log).toBe(originalConsoleLog);
  });

  it('installs nothing when the configuration disables it, even in KakaoTalk', () => {
    const teardown = init({
      config: { enabled: false, token: 'token' },
      ua: KAKAO_UA,
      url: 'https://example.test/',
    });

    expect(teardown).toBeNull();
    expect(CountingSocket.created).toBe(0);
    expect(console.log).toBe(originalConsoleLog);
  });

  it('installs hooks and opens one connection when both conditions hold', () => {
    const teardown = init({
      config: { enabled: true, token: 'token' },
      ua: KAKAO_UA,
      url: 'https://example.test/',
    });

    expect(teardown).not.toBeNull();
    expect(console.log).not.toBe(originalConsoleLog);
    expect(CountingSocket.created).toBe(1);

    teardown?.();

    expect(console.log).toBe(originalConsoleLog);
  });

  it('leaves the page console untouched when it stays inactive', () => {
    init({
      config: { enabled: true, token: 'token' },
      ua: CHROME_UA,
      url: 'https://example.test/',
    });

    expect(console.log('still the original')).toBeUndefined();
    expect(console.log).toBe(originalConsoleLog);
  });
});
