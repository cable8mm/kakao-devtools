export const KAKAOTALK_UA_PATTERN = /KAKAOTALK/i;

export function isKakaoTalkUserAgent(ua: string): boolean {
  return KAKAOTALK_UA_PATTERN.test(ua);
}

/** Activation needs both the KakaoTalk in-app browser and an enabled configuration. */
export function shouldActivate(ua: string, enabled: boolean): boolean {
  return enabled && isKakaoTalkUserAgent(ua);
}
