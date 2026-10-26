export interface QueueLimits {
  maxMessages: number;
  maxBytes: number;
}

/** ARCHITECTURE.md section 4: 500 messages or 256 KB, oldest dropped first. */
export const DEFAULT_QUEUE_LIMITS: QueueLimits = {
  maxMessages: 500,
  maxBytes: 262_144,
};

export interface QueuedFrame {
  seq: number;
  frame: string;
  bytes: number;
}

/** Bounded client queue for frames that are not acknowledged yet. */
export class MessageQueue {
  private readonly limits: QueueLimits;
  private items: QueuedFrame[] = [];
  private bytes = 0;
  private dropped = 0;

  constructor(limits: Partial<QueueLimits> = {}) {
    this.limits = { ...DEFAULT_QUEUE_LIMITS, ...limits };
  }

  push(item: QueuedFrame): void {
    this.items.push(item);
    this.bytes += item.bytes;

    while (this.items.length > this.limits.maxMessages) {
      this.dropOldest();
    }
    while (this.bytes > this.limits.maxBytes && this.items.length > 1) {
      this.dropOldest();
    }
  }

  /** Removes every frame the server has acknowledged. */
  ack(seq: number): void {
    while (this.items.length > 0 && (this.items[0]?.seq ?? Number.POSITIVE_INFINITY) <= seq) {
      const removed = this.items.shift();
      this.bytes -= removed?.bytes ?? 0;
    }
  }

  pending(): readonly QueuedFrame[] {
    return this.items;
  }

  /** Returns and resets the number of frames dropped since the last call. */
  takeDropped(): number {
    const dropped = this.dropped;
    this.dropped = 0;
    return dropped;
  }

  get length(): number {
    return this.items.length;
  }

  get byteLength(): number {
    return this.bytes;
  }

  private dropOldest(): void {
    const removed = this.items.shift();
    if (removed) {
      this.bytes -= removed.bytes;
      this.dropped += 1;
    }
  }
}
