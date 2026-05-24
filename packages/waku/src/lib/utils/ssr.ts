import { createInitialPrefetchedEntryCode } from './prefetch.js';

export function getBootstrapPreamble(options: {
  rscPath: string;
  hydrate: boolean;
  debugId?: string | undefined;
}) {
  return `
    ${options.hydrate ? 'globalThis.__WAKU_HYDRATE__ = true;' : ''}
    globalThis.__WAKU_INITIAL_RSC__ = ${createInitialPrefetchedEntryCode(
      options.rscPath,
      options.debugId,
    )};
  `;
}
