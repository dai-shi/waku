import { describe, expect, it } from 'vitest';
import { getBootstrapPreamble } from '../src/lib/utils/ssr.js';

describe('getBootstrapPreamble', () => {
  it('provides the initial RSC payload separately from client prefetches', () => {
    const preamble = getBootstrapPreamble({
      hydrate: true,
      debugId: 'debug-1',
    });
    expect(preamble).toContain('globalThis.__WAKU_INITIAL_RSC__ = (() =>');
    // The initial entry carries the streamed Response and its debug id.
    expect(preamble).toContain('e.response = Promise.resolve(new Response(');
    expect(preamble).toContain('e.debugId = "debug-1";');
  });

  it('omits the debug id when not provided', () => {
    expect(getBootstrapPreamble({ hydrate: true })).not.toContain(
      'e.debugId =',
    );
  });
});
