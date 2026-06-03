import { createInitialRscEntryCode } from './initial-rsc.js';

export function getBootstrapPreamble(options: {
  hydrate: boolean;
  debugId?: string | undefined;
}) {
  return `
    ${options.hydrate ? 'globalThis.__WAKU_HYDRATE__ = true;' : ''}
    globalThis.__WAKU_INITIAL_RSC__ = ${createInitialRscEntryCode(
      options.debugId,
    )};
  `;
}
