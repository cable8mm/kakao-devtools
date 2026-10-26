import { describe, expect, it } from 'vitest';
import { platformFromUa, SessionRegistry } from '../../src/core/session.js';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 KAKAOTALK 25.4.0';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 KAKAOTALK 25.4.0';
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';

describe('platformFromUa', () => {
  it('recognises iOS, Android and anything else', () => {
    expect(platformFromUa(IPHONE_UA)).toBe('ios');
    expect(platformFromUa(ANDROID_UA)).toBe('android');
    expect(platformFromUa(DESKTOP_UA)).toBe('other');
  });
});

describe('SessionRegistry', () => {
  it('records platform, url and connection time', () => {
    const sessions = new SessionRegistry();

    const session = sessions.connect({
      sessionId: 's-1',
      ua: ANDROID_UA,
      url: 'https://example.test/',
      now: 100,
    });

    expect(session).toMatchObject({
      sessionId: 's-1',
      platform: 'android',
      url: 'https://example.test/',
      connectedAt: 100,
      lastSeen: 100,
      lastSeq: 0,
    });
  });

  it('keeps connectedAt and the sequence when the same page reconnects', () => {
    const sessions = new SessionRegistry();
    sessions.connect({ sessionId: 's-1', ua: IPHONE_UA, url: 'https://a.test/', now: 100 });
    sessions.recordSeq('s-1', 7);

    const reconnected = sessions.connect({
      sessionId: 's-1',
      ua: IPHONE_UA,
      url: 'https://b.test/',
      now: 200,
    });

    expect(reconnected.connectedAt).toBe(100);
    expect(reconnected.lastSeen).toBe(200);
    expect(reconnected.url).toBe('https://b.test/');
    expect(sessions.lastSeq('s-1')).toBe(7);
  });

  it('never lowers the recorded sequence', () => {
    const sessions = new SessionRegistry();
    sessions.connect({ sessionId: 's-1', ua: ANDROID_UA, url: '', now: 0 });

    sessions.recordSeq('s-1', 5);
    sessions.recordSeq('s-1', 3);

    expect(sessions.lastSeq('s-1')).toBe(5);
    expect(sessions.lastSeq('unknown')).toBe(0);
  });

  it('touches lastSeen on disconnect', () => {
    const sessions = new SessionRegistry();
    sessions.connect({ sessionId: 's-1', ua: ANDROID_UA, url: '', now: 10 });

    sessions.disconnect('s-1', 42);

    expect(sessions.get('s-1')?.lastSeen).toBe(42);
    expect(sessions.list()).toHaveLength(1);
  });
});
