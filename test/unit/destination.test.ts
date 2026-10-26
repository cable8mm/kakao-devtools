import { describe, expect, it } from 'vitest';
import { buildDestination } from '../../src/browser/config.js';
import { DEFAULT_WS_PORT } from '../../src/shared/protocol.js';

describe('buildDestination', () => {
  it('defaults to ws on loopback port 7890', () => {
    expect(buildDestination()).toEqual({
      url: 'ws://127.0.0.1:7890',
      scheme: 'ws',
      host: '127.0.0.1',
      port: DEFAULT_WS_PORT,
    });
  });

  it('uses a configured tunnel host, port and wss scheme', () => {
    expect(
      buildDestination({
        scheme: 'wss',
        host: 'devtools.example.ts.net',
        port: 443,
      }),
    ).toEqual({
      url: 'wss://devtools.example.ts.net:443',
      scheme: 'wss',
      host: 'devtools.example.ts.net',
      port: 443,
    });
  });

  it('keeps the destination independent of the local receiver port', () => {
    const destination = buildDestination({ host: 'ngrok.example', port: 43_210 });

    expect(destination.port).toBe(43_210);
    expect(DEFAULT_WS_PORT).toBe(7890);
  });

  it('rejects an unknown scheme, an empty host and an out-of-range port', () => {
    expect(() => buildDestination({ scheme: 'http' as 'ws' })).toThrow(/scheme/);
    expect(() => buildDestination({ host: '  ' })).toThrow(/host/);
    expect(() => buildDestination({ port: 0 })).toThrow(/port/);
    expect(() => buildDestination({ port: 70_000 })).toThrow(/port/);
  });
});
