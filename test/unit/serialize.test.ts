import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SERIALIZE_LIMITS,
  serializeArgs,
  serializeValue,
} from '../../src/browser/serialize.js';

describe('serializeValue', () => {
  it('keeps primitives and marks values JSON cannot hold', () => {
    expect(serializeValue('text')).toBe('text');
    expect(serializeValue(7)).toBe(7);
    expect(serializeValue(false)).toBe(false);
    expect(serializeValue(null)).toBe(null);
    expect(serializeValue(undefined)).toBe('[undefined]');
    expect(serializeValue(10n)).toBe('10n');
  });

  it('marks functions and symbols', () => {
    expect(serializeValue(function named() {})).toBe('[Function named]');
    expect(serializeValue(Symbol('tag'))).toBe('Symbol(tag)');
  });

  it('replaces circular references with a marker', () => {
    const value: Record<string, unknown> = { name: 'loop' };
    value.self = value;

    expect(serializeValue(value)).toEqual({ name: 'loop', self: '[Circular]' });
  });

  it('cuts nesting at the depth limit', () => {
    const deep = { a: { b: { c: { d: { e: 'too deep' } } } } };

    expect(serializeValue(deep, DEFAULT_SERIALIZE_LIMITS)).toEqual({
      a: { b: { c: { d: '[MaxDepth]' } } },
    });
  });

  it('truncates long strings', () => {
    const result = serializeValue('y'.repeat(50), {
      maxDepth: 4,
      maxStringLength: 10,
      maxEntryLength: 1_000,
    });

    expect(result).toContain('…[truncated 50 chars]');
  });

  it('serializes errors, dates, maps and sets', () => {
    expect(serializeValue(new Error('boom'))).toMatchObject({ name: 'Error', message: 'boom' });
    expect(serializeValue(new Date('2026-01-02T03:04:05.000Z'))).toBe('2026-01-02T03:04:05.000Z');
    expect(serializeValue(new Map([['a', 1]]))).toEqual([['a', 1]]);
    expect(serializeValue(new Set([1, 2]))).toEqual([1, 2]);
  });
});

describe('serializeArgs', () => {
  it('returns serialized arguments below the entry cap', () => {
    expect(serializeArgs(['a', { b: 1 }])).toEqual(['a', { b: 1 }]);
  });

  it('replaces the whole entry when it exceeds the entry cap', () => {
    const result = serializeArgs(
      Array.from({ length: 10 }, (_, index) => ({ key: index, blob: 'z'.repeat(2_000) })),
    );

    expect(result).toHaveLength(1);
    expect(String(result[0])).toMatch(/^\[entry truncated: \d+ chars\]$/);
  });
});
