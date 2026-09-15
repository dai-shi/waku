import {
  ETAGS_ID,
  IMMUTABLE_ETAG,
  isValidEtag,
} from '../../lib/utils/etags.js';
import type { Etag, Etags } from '../../lib/utils/etags.js';

type Elements = Readonly<Record<string | symbol, unknown>>;

type SlotEtags = Map<string | symbol, Etag>;

const slotEtagsByElements = new WeakMap<Elements, SlotEtags>();

const ensureSlotEtags = (elements: Elements): SlotEtags => {
  let slotEtags = slotEtagsByElements.get(elements);
  if (!slotEtags) {
    slotEtags = new Map();
    slotEtagsByElements.set(elements, slotEtags);
  }
  return slotEtags;
};

/** Whether the server delivered the element under `slotId` as immutable. */
export const isImmutableElement = (
  elements: Elements,
  slotId: string,
): boolean => slotEtagsByElements.get(elements)?.get(slotId) === IMMUTABLE_ETAG;

export const collectEtags = (elements: Elements): Etags =>
  Object.fromEntries(slotEtagsByElements.get(elements) ?? []);

export const adoptElements = (data: Elements): Elements => {
  const elements = Object.fromEntries(
    Object.entries(data).filter(([key]) => !key.startsWith('_')),
  );
  const etags = (data[ETAGS_ID] as Record<string, unknown> | undefined) ?? {};
  const slotEtags = ensureSlotEtags(elements);
  for (const [slotId, etag] of Object.entries(etags)) {
    if (Object.hasOwn(elements, slotId) && isValidEtag(etag)) {
      slotEtags.set(slotId, etag);
    }
  }
  return elements;
};

export const copyElement = (
  target: Record<string | symbol, unknown>,
  source: Elements,
  key: string | symbol,
): void => {
  target[key] = source[key];
  const etag = slotEtagsByElements.get(source)?.get(key);
  if (etag === undefined) {
    slotEtagsByElements.get(target)?.delete(key);
  } else {
    ensureSlotEtags(target).set(key, etag);
  }
};

/**
 * Returns a new record with the entries of `b` over those of `a`, keeping the
 * etags each value arrived with. Combine records with this rather than a
 * spread or `Object.assign`, which drop them. With `unstable_filter`, only the
 * keys of `b` it accepts are taken.
 */
export const combineElements = (
  a: Elements,
  b: Elements,
  options?: { unstable_filter?: (key: string | symbol) => boolean },
): Elements => {
  const filter = options?.unstable_filter;
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
