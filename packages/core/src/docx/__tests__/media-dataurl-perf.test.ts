import { describe, expect, test } from 'bun:test';
import { arrayBufferToBase64, mediaToDataUrl } from '../unzip';

function deterministicBytes(size: number, seed = 0): Uint8Array {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) out[i] = (i * 31 + seed) & 0xff;
  return out;
}

describe('media data URL perf (fixes #146)', () => {
  test('encodes empty input', () => {
    expect(mediaToDataUrl(new ArrayBuffer(0), 'image/png')).toBe('data:image/png;base64,');
  });

  test('encodes small bytes exactly', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(arrayBufferToBase64(bytes)).toBe('SGVsbG8=');
    expect(mediaToDataUrl(bytes, 'image/png')).toBe('data:image/png;base64,SGVsbG8=');
  });

  test('matches Buffer oracle across chunk boundaries', () => {
    for (const size of [0x7fff, 0x8000, 0x8001, 0x10001]) {
      const bytes = deterministicBytes(size);
      const expected = Buffer.from(bytes).toString('base64');
      expect(arrayBufferToBase64(bytes)).toBe(expected);
      expect(arrayBufferToBase64(bytes.buffer as ArrayBuffer)).toBe(expected);
    }
  });

  test('respects Uint8Array view offsets', () => {
    const backing = deterministicBytes(0x9000, 7);
    const view = backing.subarray(100, 0x8100);
    const expected = Buffer.from(view).toString('base64');
    expect(arrayBufferToBase64(view)).toBe(expected);
  });

  test('falls back to chunked btoa when Buffer is unavailable (browser path)', () => {
    const g = globalThis as unknown as { Buffer?: unknown };
    const RealBuffer = g.Buffer as typeof Buffer;
    g.Buffer = undefined;
    try {
      for (const size of [0x7fff, 0x8000, 0x8001, 0x10001]) {
        const bytes = deterministicBytes(size);
        const expected = RealBuffer.from(bytes).toString('base64');
        expect(arrayBufferToBase64(bytes)).toBe(expected);
        expect(arrayBufferToBase64(bytes.buffer as ArrayBuffer)).toBe(expected);
      }
      const backing = deterministicBytes(0x9000, 7);
      const view = backing.subarray(100, 0x8100);
      expect(arrayBufferToBase64(view)).toBe(RealBuffer.from(view).toString('base64'));
    } finally {
      g.Buffer = RealBuffer;
    }
  });

  test('5MB buffer converts correctly without throwing', () => {
    const bytes = deterministicBytes(5 * 1024 * 1024, 13);
    const url = mediaToDataUrl(bytes, 'image/png');
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    const b64 = url.slice('data:image/png;base64,'.length);
    const decoded = Buffer.from(b64, 'base64');
    expect(decoded.length).toBe(bytes.length);
    // Spot-check first/last/middle bytes survive the round-trip.
    expect(decoded[0]).toBe(bytes[0]);
    expect(decoded[decoded.length - 1]).toBe(bytes[bytes.length - 1]);
    expect(decoded[1234567]).toBe(bytes[1234567]);
  });
});
