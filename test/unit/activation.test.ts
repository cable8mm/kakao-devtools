import { describe, expect, it } from 'vitest';
import { isKakaoTalkUserAgent, shouldActivate } from '../../src/browser/activation.js';

const KAKAO_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 KAKAOTALK 25.4.0';
const CHROME_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile';

describe('isKakaoTalkUserAgent', () => {
  it('matches the token in any case', () => {
    expect(isKakaoTalkUserAgent(KAKAO_UA)).toBe(true);
    expect(isKakaoTalkUserAgent('Mozilla/5.0 kakaotalk 25.4.0')).toBe(true);
  });

  it('does not match other browsers', () => {
    expect(isKakaoTalkUserAgent(CHROME_UA)).toBe(false);
    expect(isKakaoTalkUserAgent('')).toBe(false);
  });
});

describe('shouldActivate', () => {
  it('activates in the KakaoTalk in-app browser when enabled', () => {
    expect(shouldActivate(KAKAO_UA, true)).toBe(true);
  });

  it('stays off when the configuration disables it', () => {
    expect(shouldActivate(KAKAO_UA, false)).toBe(false);
  });

  it('stays off in other browsers even when enabled', () => {
    expect(shouldActivate(CHROME_UA, true)).toBe(false);
  });
});
