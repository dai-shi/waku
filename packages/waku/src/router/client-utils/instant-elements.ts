import { startTransition, useCallback } from 'react';
import {
  unstable_combineElements as combineElements,
  unstable_isImmutableElement as isImmutableElement,
  useMergeElements_UNSTABLE as useMergeElements,
} from 'waku/minimal/client';

type Elements = Readonly<Record<string | symbol, unknown>>;

export const useMergeInstantElements = () => {
  const mergeElements = useMergeElements();
  return useCallback(
    (
      response: Promise<Elements>,
      signal: AbortSignal,
      pin: (key: string | symbol) => boolean,
      base?: Elements,
      overlay?: Elements,
    ) => {
      const mergeResults = new WeakMap<Promise<Elements>, Elements>();
      const incoming = mergeElements(response, (prev, recovered) => {
        if (signal.aborted) {
          return prev;
        }
        const merged = Promise.resolve(prev).then((current) => {
          if (signal.aborted) {
            return current;
          }
          const available = base
            ? combineElements(current, base, {
                filter: (key) => typeof key === 'string' && !(key in current),
              })
            : current;
          const holes: Record<string | symbol, unknown> = {};
          for (const key of Reflect.ownKeys(available)) {
            const pinned =
              key in current
                ? pin(key)
                : isImmutableElement(available, String(key));
            if (!pinned) {
              holes[key] = recovered.then((elements) =>
                key in elements
                  ? elements[key]
                  : base && key in base
                    ? base[key]
                    : current[key],
              );
            }
          }
          const waiting = combineElements(available, holes);
          const elements = overlay
            ? combineElements(waiting, overlay)
            : waiting;
          mergeResults.set(merged, elements);
          return elements;
        });
        return merged;
      });
      return incoming.then((resolved) => {
        startTransition(() => {
          void mergeElements(resolved, (prev) => {
            if (signal.aborted) {
              return prev;
            }
            const shouldMerge = (current: Elements, key: string) =>
              !(key in current) ||
              !!(
                overlay &&
                Object.hasOwn(overlay, key) &&
                current[key] === overlay[key]
              );
            const current = mergeResults.get(prev);
            if (
              current &&
              !Object.keys(resolved).some((key) => shouldMerge(current, key))
            ) {
              return prev;
            }
            return prev.then((current) =>
              signal.aborted
                ? current
                : combineElements(current, resolved, {
                    filter: (key) =>
                      typeof key === 'string' && shouldMerge(current, key),
                  }),
            );
          });
        });
        return resolved;
      });
    },
    [mergeElements],
  );
};
