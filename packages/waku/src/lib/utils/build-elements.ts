import { IMMUTABLE_ETAG, isValidEtag } from './etags.js';
import type { Etags } from './etags.js';

/** A slot renderer and its validator; immutable slots are reusable indefinitely. */
export type ElementSource = {
  immutable?: boolean;
  getEtag?: (() => Promise<string | undefined>) | undefined;
  render: () => unknown | Promise<unknown>;
};

type BuiltElements = {
  elements: Record<string, unknown>;
  etags: Etags;
};

/**
 * Renders sources whose validators the client does not hold, returning their
 * elements and etags for `renderRsc`. Missing or invalid validators force a
 * render; a previously advertised validator is then cleared.
 */
export const buildElements = async (
  clientEtags: Etags,
  elementSources: Record<string, ElementSource>,
): Promise<BuiltElements> => {
  const elements: Record<string, unknown> = {};
  const etags: Etags = {};
  await Promise.all(
    Object.entries(elementSources).map(async ([slotId, elementSource]) => {
      // keep only header-safe etags; '' (the clear sentinel) and invalid mean no etag
      const rawEtag = elementSource.immutable
        ? IMMUTABLE_ETAG
        : await elementSource.getEtag?.();
      const etag = isValidEtag(rawEtag) ? rawEtag : undefined;
      if (etag !== undefined && etag === clientEtags[slotId]) {
        return;
      }
      elements[slotId] = await elementSource.render();
      if (etag !== undefined) {
        etags[slotId] = etag;
      } else if (clientEtags[slotId] !== undefined) {
        // clear the client's now-stale tag
        etags[slotId] = '';
      }
    }),
  );
  return { elements, etags };
};
