import { describe, expect, it } from 'vitest';
import { ProtocolError, parseClientMessage } from '../../src/core/protocol.js';
import { MAX_FRAME_BYTES, PROTOCOL_VERSION } from '../../src/shared/protocol.js';

function frame(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

const hello = {
  type: 'hello',
  v: PROTOCOL_VERSION,
  token: 'secret',
  sessionId: 's-1',
  ua: 'KAKAOTALK Android',
  url: 'https://example.test/',
  lastAckedSeq: 0,
};

describe('parseClientMessage', () => {
  it('accepts a hello frame and drops unknown fields', () => {
    const parsed = parseClientMessage(frame({ ...hello, extra: 'ignored' }));

    expect(parsed).toEqual(hello);
  });

  it('rejects a hello frame from another protocol version', () => {
    expect(() => parseClientMessage(frame({ ...hello, v: 2 }))).toThrowError(
      expect.objectContaining({ code: 'bad_version' }),
    );
  });

  it('accepts a log frame with a level and timestamp', () => {
    const parsed = parseClientMessage(
      frame({ type: 'log', seq: 3, ts: 1_700_000_000_000, level: 'warn', args: ['a', 1] }),
    );

    expect(parsed).toEqual({
      type: 'log',
      seq: 3,
      ts: 1_700_000_000_000,
      level: 'warn',
      args: ['a', 1],
    });
  });

  it('accepts error, sdk_error and event frames', () => {
    expect(
      parseClientMessage(
        frame({ type: 'error', seq: 4, ts: 1, message: 'boom', stack: 'at x', source: 'a.js:1' }),
      ),
    ).toMatchObject({ type: 'error', message: 'boom', source: 'a.js:1' });

    expect(
      parseClientMessage(
        frame({ type: 'sdk_error', seq: 5, ts: 1, api: 'Kakao.Share.sendDefault', code: -401 }),
      ),
    ).toMatchObject({ type: 'sdk_error', api: 'Kakao.Share.sendDefault', code: -401 });

    expect(
      parseClientMessage(frame({ type: 'event', seq: 6, ts: 1, name: 'login_no_response' })),
    ).toMatchObject({ type: 'event', name: 'login_no_response' });
  });

  it('accepts a ping frame', () => {
    expect(parseClientMessage(frame({ type: 'ping' }))).toEqual({ type: 'ping' });
  });

  it('rejects malformed JSON', () => {
    expect(() => parseClientMessage('{not json')).toThrow(ProtocolError);
  });

  it('rejects an unknown message type', () => {
    expect(() => parseClientMessage(frame({ type: 'mystery' }))).toThrow(/unknown message type/);
  });

  it('rejects a log frame with a bad level, a negative seq or non-array args', () => {
    expect(() =>
      parseClientMessage(frame({ type: 'log', seq: 1, ts: 1, level: 'trace', args: [] })),
    ).toThrow(/level/);
    expect(() =>
      parseClientMessage(frame({ type: 'log', seq: -1, ts: 1, level: 'log', args: [] })),
    ).toThrow(/seq/);
    expect(() =>
      parseClientMessage(frame({ type: 'log', seq: 1, ts: 1, level: 'log', args: 'nope' })),
    ).toThrow(/args/);
  });

  it('rejects an sdk_error frame whose code is neither string nor number', () => {
    expect(() =>
      parseClientMessage(frame({ type: 'sdk_error', seq: 1, ts: 1, api: 'x', code: { a: 1 } })),
    ).toThrow(/code/);
  });

  it('rejects a frame above the size limit', () => {
    const oversized = `{"type":"ping","padding":"${'x'.repeat(MAX_FRAME_BYTES)}"}`;

    expect(() => parseClientMessage(oversized)).toThrow(/too large/);
  });
});
