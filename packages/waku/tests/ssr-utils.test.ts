import { describe, expect, it } from 'vitest';
import { getBootstrapPreamble } from '../src/lib/utils/ssr.js';

describe('getBootstrapPreamble', () => {
  it('provides the initial RSC payload separately from client prefetches', () => {
    expect(
      getBootstrapPreamble({
        rscPath: 'R/404.txt',
        hydrate: true,
      }),
    ).toContain('globalThis.__WAKU_INITIAL_RSC__ = (() =>');
    expect(
      getBootstrapPreamble({
        rscPath: 'R/404.txt',
        hydrate: true,
      }),
    ).toContain('e.p = "R/404.txt";');
  });
});
