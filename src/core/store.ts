import type { StoredEntry } from '../shared/protocol.js';

export interface StoreLimits {
  maxEntries: number;
  maxBytes: number;
}

/** ARCHITECTURE.md section 3: 5,000 entries and 2 MB per session. */
export const DEFAULT_STORE_LIMITS: StoreLimits = {
  maxEntries: 5_000,
  maxBytes: 2_000_000,
};

export interface StoreUsage {
  sessionId: string;
  entries: number;
  bytes: number;
}

interface BufferedEntry {
  entry: StoredEntry;
  bytes: number;
}

function measure(entry: StoredEntry): number {
  return Buffer.byteLength(JSON.stringify(entry), 'utf8');
}

function assertLimit(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

/** In-memory ring buffer per session. Oldest entries are dropped first. */
export class LogStore {
  private readonly limits: StoreLimits;
  private readonly buffers = new Map<string, BufferedEntry[]>();
  private readonly sizes = new Map<string, number>();

  constructor(limits: StoreLimits = DEFAULT_STORE_LIMITS) {
    assertLimit('maxEntries', limits.maxEntries);
    assertLimit('maxBytes', limits.maxBytes);
    this.limits = { ...limits };
  }

  append(sessionId: string, entry: StoredEntry): void {
    const buffered: BufferedEntry = { entry, bytes: measure(entry) };
    const buffer = this.buffers.get(sessionId) ?? [];
    if (!this.buffers.has(sessionId)) {
      this.buffers.set(sessionId, buffer);
      this.sizes.set(sessionId, 0);
    }

    buffer.push(buffered);
    this.sizes.set(sessionId, (this.sizes.get(sessionId) ?? 0) + buffered.bytes);
    this.trim(sessionId, buffer);
  }

  entries(sessionId?: string): StoredEntry[] {
    if (sessionId !== undefined) {
      return (this.buffers.get(sessionId) ?? []).map((buffered) => buffered.entry);
    }

    return [...this.buffers.values()]
      .flatMap((buffer) => buffer.map((buffered) => buffered.entry))
      .sort((left, right) => left.ts - right.ts || left.seq - right.seq);
  }

  clear(sessionId?: string): number {
    if (sessionId !== undefined) {
      const removed = this.buffers.get(sessionId)?.length ?? 0;
      this.buffers.delete(sessionId);
      this.sizes.delete(sessionId);
      return removed;
    }

    const removed = [...this.buffers.values()].reduce((total, buffer) => total + buffer.length, 0);
    this.buffers.clear();
    this.sizes.clear();
    return removed;
  }

  usage(): StoreUsage[] {
    return [...this.buffers.entries()].map(([sessionId, buffer]) => ({
      sessionId,
      entries: buffer.length,
      bytes: this.sizes.get(sessionId) ?? 0,
    }));
  }

  private trim(sessionId: string, buffer: BufferedEntry[]): void {
    let size = this.sizes.get(sessionId) ?? 0;

    while (buffer.length > this.limits.maxEntries) {
      const dropped = buffer.shift();
      size -= dropped?.bytes ?? 0;
    }

    while (size > this.limits.maxBytes && buffer.length > 0) {
      const dropped = buffer.shift();
      size -= dropped?.bytes ?? 0;
    }

    this.sizes.set(sessionId, size);
  }
}
