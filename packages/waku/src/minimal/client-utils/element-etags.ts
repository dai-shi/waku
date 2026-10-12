import {
  ETAGS_ID,
  IMMUTABLE_ETAG,
  isValidEtag,
} from '../../lib/utils-isomorphic/etags.js';
import type { Etag, Etags } from '../../lib/utils-isomorphic/etags.js';

type Elements = Readonly<Record<string | symbol, unknown>>;

type SlotMetadata = { etag?: Etag };

const metadataByElements = new WeakMap<
  Elements,
  Map<string | symbol, SlotMetadata>
>();

const getMetadata = (elements: Elements) => {
  let metadata = metadataByElements.get(elements);
  if (!metadata) {
    metadata = new Map<string | symbol, SlotMetadata>();
    metadataByElements.set(elements, metadata);
  }
  return metadata;
};

const getSlotMetadata = (elements: Elements, slotId: string | symbol) => {
  const metadata = getMetadata(elements);
  let slot = metadata.get(slotId);
  if (!slot) {
    slot = {};
    metadata.set(slotId, slot);
  }
  return slot;
};

/** Whether the server delivered the element under `slotId` as immutable. */
export const isImmutableElement = (
  elements: Elements,
  slotId: string,
): boolean =>
  metadataByElements.get(elements)?.get(slotId)?.etag === IMMUTABLE_ETAG;

/**
 * Whether two records retain the same slot source and value (`Object.is`).
 * `combineElements` preserves a slot's source and validator; separate records
 * or responses introduce distinct sources even for equal values and validators.
 * Two absent slots are equal. Use this to detect intervening writes in a merge.
 */
export const isSameElement = (
  a: Elements,
  b: Elements,
  slotId: string | symbol,
): boolean => {
  const hasA = Object.hasOwn(a, slotId);
  return (
    hasA === Object.hasOwn(b, slotId) &&
    (!hasA ||
      (Object.is(a[slotId], b[slotId]) &&
        getSlotMetadata(a, slotId) === getSlotMetadata(b, slotId)))
  );
};

export const collectEtags = (elements: Elements): Etags =>
  Object.fromEntries(
    [...(metadataByElements.get(elements) ?? [])].flatMap(([key, { etag }]) =>
      etag === undefined ? [] : [[key, etag] as const],
    ),
  );

export const adoptElements = (data: Elements): Elements => {
  const elements = Object.fromEntries(
    Object.entries(data).filter(([key]) => !key.startsWith('_')),
  );
  const etags = (data[ETAGS_ID] as Record<string, unknown> | undefined) ?? {};
  for (const [slotId, etag] of Object.entries(etags)) {
    if (Object.hasOwn(elements, slotId) && isValidEtag(etag)) {
      getSlotMetadata(elements, slotId).etag = etag;
    }
  }
  return elements;
};

const copyElement = (
  target: Record<string | symbol, unknown>,
  source: Elements,
  key: string | symbol,
): void => {
  target[key] = source[key];
  getMetadata(target).set(key, getSlotMetadata(source, key));
};

/**
 * Returns a new record with the entries of `b` over those of `a`, keeping the
 * source and etag each value arrived with. Combine records with this rather
 * than a spread or `Object.assign`, which drop them. With `filter`, only the
 * keys of `b` it accepts are taken.
 */
export const combineElements = (
  a: Elements,
  b: Elements,
  options?: { filter?: (key: string | symbol) => boolean },
): Elements => {
  const filter = options?.filter;
  const combined: Record<string | symbol, unknown> = {};
  for (const key of Reflect.ownKeys(a)) {
    copyElement(combined, a, key);
  }
  for (const key of Reflect.ownKeys(b)) {
    if (!filter || filter(key)) {
      copyElement(combined, b, key);
    }
  }
  return combined;
};
