import { describe, expect, test } from 'vitest';
import {
  base64ToBytes as base64ToBytesNode,
  bytesToBase64 as bytesToBase64Node,
} from '../src/lib/utils/base64-node.js';
import {
  base64ToBytes as base64ToBytesWeb,
  bytesToBase64 as bytesToBase64Web,
} from '../src/lib/utils/base64-web.js';

describe('base64-node and base64-web equivalence', () => {
  const samples = [
    new Uint8Array(0),
    new TextEncoder().encode('hello world'),
    Uint8Array.from({ length: 256 }, (_, i) => i),
  ];

  test('both implementations encode identically', () => {
    for (const bytes of samples) {
      expect(bytesToBase64Node(bytes)).toBe(bytesToBase64Web(bytes));
    }
  });

  test('both implementations round-trip', () => {
    for (const bytes of samples) {
      const base64 = bytesToBase64Web(bytes);
      expect(base64ToBytesWeb(base64)).toEqual(bytes);
      expect(base64ToBytesNode(base64)).toEqual(bytes);
    }
  });
});
