import type { ReactNode } from 'react';
import { deserializeRsc, serializeRsc } from 'waku/server';

// A minimal reference implementation of a "waku-cache"-style server cache. It
// wraps a component so its rendered subtree is serialized to RSC bytes once and
// replayed on later requests, and exposes a matching `getEtag`, an eager per-key
// cache tag that lets Waku skip re-sending an unchanged element to the client.
// A real library would use a pluggable store (memory/redis/etc.) and offer
// richer invalidation; here everything is in-memory and the tag is derived from
// a per-key version counter so it is known without rendering.

type PageProps = Record<string, unknown>;

const versions = new Map<string, number>();
const renderCache = new Map<string, Promise<Uint8Array>>();

const tagOf = (key: string) => `${key}@${versions.get(key) ?? 0}`;

export const cacheRsc = (
  Component: (props: PageProps) => ReactNode | Promise<ReactNode>,
  getKey: (props: PageProps) => string,
) => {
  const Cached = async (props: PageProps): Promise<ReactNode> => {
    const key = getKey(props);
    let bytes = renderCache.get(key);
    if (!bytes) {
      bytes = serializeRsc(await Component(props));
      renderCache.set(key, bytes);
    }
    return (await deserializeRsc(await bytes)) as ReactNode;
  };
  // Eager cache tag: known from the key + version, no rendering required. Wire
  // it into `getConfig` as `unstable_getEtag` so Waku can skip the slot on
  // navigation when the client already holds the current tag.
  const getEtag = async (props: PageProps): Promise<string> =>
    tagOf(getKey(props));
  return { Component: Cached, getEtag };
};

export const invalidate = (key: string): void => {
  versions.set(key, (versions.get(key) ?? 0) + 1);
  renderCache.delete(key);
};
