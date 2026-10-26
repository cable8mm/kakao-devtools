export type Platform = 'ios' | 'android' | 'other';

/** Derives the phone platform from a user agent, as ARCHITECTURE.md section 3 requires. */
export function platformFromUa(ua: string): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return 'ios';
  }
  if (/Android/i.test(ua)) {
    return 'android';
  }
  return 'other';
}

export interface SessionInfo {
  sessionId: string;
  ua: string;
  platform: Platform;
  url: string;
  connectedAt: number;
  lastSeen: number;
  lastSeq: number;
}

export interface ConnectOptions {
  sessionId: string;
  ua: string;
  url: string;
  now: number;
}

/** Tracks one session per connected page. A reconnecting page keeps its session. */
export class SessionRegistry {
  private readonly sessions = new Map<string, SessionInfo>();

  connect({ sessionId, ua, url, now }: ConnectOptions): SessionInfo {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.ua = ua;
      existing.platform = platformFromUa(ua);
      existing.url = url;
      existing.lastSeen = now;
      return existing;
    }

    const session: SessionInfo = {
      sessionId,
      ua,
      platform: platformFromUa(ua),
      url,
      connectedAt: now,
      lastSeen: now,
      lastSeq: 0,
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  touch(sessionId: string, now: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastSeen = now;
    }
  }

  disconnect(sessionId: string, now: number): void {
    this.touch(sessionId, now);
  }

  get(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  list(): SessionInfo[] {
    return [...this.sessions.values()];
  }

  /** Highest sequence number already stored for the session, used for dedupe and welcome. */
  lastSeq(sessionId: string): number {
    return this.sessions.get(sessionId)?.lastSeq ?? 0;
  }

  recordSeq(sessionId: string, seq: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastSeq = Math.max(session.lastSeq, seq);
    }
  }
}
