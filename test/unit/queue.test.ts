import { describe, expect, it } from 'vitest';
import { DEFAULT_QUEUE_LIMITS, MessageQueue } from '../../src/browser/queue.js';

function item(seq: number, size = 10): { seq: number; frame: string; bytes: number } {
  return { seq, frame: 'x'.repeat(size), bytes: size };
}

describe('MessageQueue', () => {
  it('defaults to 500 frames and 256 KB', () => {
    expect(DEFAULT_QUEUE_LIMITS).toEqual({ maxMessages: 500, maxBytes: 262_144 });
  });

  it('drops the oldest frames once the message cap is exceeded', () => {
    const queue = new MessageQueue({ maxMessages: 2, maxBytes: 1_000 });

    queue.push(item(1));
    queue.push(item(2));
    queue.push(item(3));

    expect(queue.pending().map((frame) => frame.seq)).toEqual([2, 3]);
    expect(queue.takeDropped()).toBe(1);
    expect(queue.takeDropped()).toBe(0);
  });

  it('drops the oldest frames once the byte cap is exceeded', () => {
    const queue = new MessageQueue({ maxMessages: 100, maxBytes: 30 });

    queue.push(item(1, 20));
    queue.push(item(2, 20));

    expect(queue.pending().map((frame) => frame.seq)).toEqual([2]);
    expect(queue.byteLength).toBe(20);
  });

  it('removes acknowledged frames up to the sequence', () => {
    const queue = new MessageQueue();
    queue.push(item(1));
    queue.push(item(2));
    queue.push(item(3));

    queue.ack(2);

    expect(queue.pending().map((frame) => frame.seq)).toEqual([3]);
    expect(queue.length).toBe(1);
    expect(queue.byteLength).toBe(10);
  });

  it('ignores an acknowledgement beyond the queue', () => {
    const queue = new MessageQueue();
    queue.push(item(1));

    queue.ack(99);

    expect(queue.length).toBe(0);
    expect(queue.byteLength).toBe(0);
  });
});
