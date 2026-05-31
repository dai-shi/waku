import { describe, expect, test } from 'vitest';
import { sanitizeLog } from '../src/lib/utils/log.js';

describe('sanitizeLog', () => {
  test('escapes newlines that could forge log lines', () => {
    expect(sanitizeLog('ok\r\nFAKE level=error injected')).toBe(
      'ok\\x0d\\nFAKE level=error injected',
    );
  });

  test('escapes the ESC byte so ANSI sequences become inert text', () => {
    // The ESC becomes "\x1b"; the residual "[31m" is plain text and cannot
    // move the cursor or recolor a terminal.
    expect(sanitizeLog('before\x1b[31mred\x1b[0mafter')).toBe(
      'before\\x1b[31mred\\x1b[0mafter',
    );
  });

  test('escapes C0 control chars, DEL, tab and carriage return as hex', () => {
    expect(sanitizeLog('a\x00b\x07c\x7fd\te\nf')).toBe(
      'a\\x00b\\x07c\\x7fd\\x09e\\nf',
    );
  });

  test('uses the stack for Error values and leaves no raw newlines', () => {
    const err = new Error('boom\r\ninjected');
    const out = sanitizeLog(err);
    expect(out).toContain('boom');
    expect(out).not.toContain('\r');
    expect(out).not.toContain('\n');
  });

  test('falls back to String() for non-error values', () => {
    expect(sanitizeLog(42)).toBe('42');
    expect(sanitizeLog(null)).toBe('null');
  });
});
