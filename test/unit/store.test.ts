import { describe, expect, it } from 'vitest';
import { LogStore } from '../../src/core/store.js';
import type { StoredEntry } from '../../src/shared/protocol.js';

function logEntry(seq: number, text = 'line'): StoredEntry {
  return { sessionId: 's-1', kind: 'log', seq, ts: 1_000 + seq, level: 'log', args: [text] };
}

describe('LogStore', () => {
  it('keeps entries in emission order per session', () => {
    const store = new LogStore();

    store.append('s-1', logEntry(1, 'first'));
    store.append('s-1', logEntry(2, 'second'));

    expect(store.entries('s-1').map((entry) => entry.seq)).toEqual([1, 2]);
  });

  it('keeps sessions apart', () => {
    const store = new LogStore();

    store.append('s-1', logEntry(1, 'one'));
    store.append('s-2', { ...logEntry(1, 'two'), sessionId: 's-2' });

    expect(store.entries('s-1')).toHaveLength(1);
    expect(store.entries('s-2')).toHaveLength(1);
    expect(store.entries()).toHaveLength(2);
  });

  it('drops the oldest entry when the entry cap is exceeded', () => {
    const store = new LogStore({ maxEntries: 2, maxBytes: 1_000_000 });

    store.append('s-1', logEntry(1));
    store.append('s-1', logEntry(2));
    store.append('s-1', logEntry(3));

    expect(store.entries('s-1').map((entry) => entry.seq)).toEqual([2, 3]);
  });

  it('drops the oldest entry when the byte cap is exceeded', () => {
    const store = new LogStore({ maxEntries: 100, maxBytes: 300 });

    for (let seq = 1; seq <= 5; seq += 1) {
      store.append('s-1', logEntry(seq, 'x'.repeat(60)));
    }

    const entries = store.entries('s-1');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.length).toBeLessThan(5);
    expect(entries.at(-1)?.seq).toBe(5);
  });

  it('reports usage per session', () => {
    const store = new LogStore();
    store.append('s-1', logEntry(1));
    store.append('s-1', logEntry(2));

    expect(store.usage()).toEqual([{ sessionId: 's-1', entries: 2, bytes: expect.any(Number) }]);
  });

  it('clears one session or everything and reports the count', () => {
    const store = new LogStore();
    store.append('s-1', logEntry(1));
    store.append('s-2', logEntry(1));

    expect(store.clear('s-1')).toBe(1);
    expect(store.entries('s-1')).toEqual([]);
    expect(store.entries('s-2')).toHaveLength(1);

    expect(store.clear()).toBe(1);
    expect(store.entries()).toEqual([]);
  });

  it('rejects non-positive limits', () => {
    expect(() => new LogStore({ maxEntries: 0, maxBytes: 10 })).toThrow(RangeError);
    expect(() => new LogStore({ maxEntries: 10, maxBytes: -1 })).toThrow(RangeError);
  });
});
