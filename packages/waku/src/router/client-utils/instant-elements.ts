import { startTransition, useCallback } from 'react';
import {
  unstable_combineElements as combineElements,
  unstable_isImmutableElement as isImmutableElement,
  unstable_isSameElement as isSameElement,
  useMergeElements_UNSTABLE as useMergeElements,
} from 'waku/minimal/client';

type Elements = Readonly<Record<string | symbol, unknown>>;

export const useMergeInstantElements = () => {
  const mergeElements = useMergeElements();
  return useCallback(
    (
      data: Promise<Elements>,
      isCurrent: () => boolean,
      pin: (key: string | symbol) => boolean,
      base?: Elements,
      overlay?: Elements,
    ) => {
      let patch = overlay ?? {};
      const mergeResults = new WeakMap<Promise<Elements>, Elements>();
      const incoming = mergeElements(data, (prev, recovered) => {
        if (!isCurrent()) {
          return prev;
        }
        const merged = Promise.resolve(prev).then((current) => {
          if (!isCurrent()) {
            return current;
          }
          const available = base
            ? combineElements(current, base, {
                filter: (key) =>
                  typeof key === 'string' && !Object.hasOwn(current, key),
              })
            : current;
          const holes: Record<string | symbol, unknown> = {};
          for (const key of Reflect.ownKeys(available)) {
            const pinned = Object.hasOwn(current, key)
              ? pin(key)
              : isImmutableElement(available, String(key));
            if (!pinned) {
              holes[key] = recovered.then((elements) =>
                Object.hasOwn(elements, key)
                  ? elements[key]
                  : base && Object.hasOwn(base, key)
                    ? base[key]
                    : current[key],
              );
            }
          }
          const waiting = combineElements(available, holes);
          const elements = overlay
            ? combineElements(waiting, overlay)
            : waiting;
          patch = combineElements(patch, elements, {
            filter: (key) => !isSameElement(current, elements, key),
          });
          mergeResults.set(merged, elements);
          return elements;
        });
        return merged;
      });
      const response = incoming.then((resolved) => {
        startTransition(() => {
          void mergeElements(resolved, (prev) => {
            if (!isCurrent()) {
              return prev;
            }
            const shouldMerge = (current: Elements, key: string) =>
              !Object.hasOwn(current, key) ||
              !!(
                overlay &&
                Object.hasOwn(overlay, key) &&
                isSameElement(current, overlay, key)
              );
            const current = mergeResults.get(prev);
            if (
              current &&
              !Object.keys(resolved).some((key) => shouldMerge(current, key))
            ) {
              return prev;
            }
            return prev.then((current) => {
              if (!isCurrent()) {
                return current;
              }
              const added = combineElements({}, resolved, {
                filter: (key) =>
                  typeof key === 'string' && shouldMerge(current, key),
              });
              patch = combineElements(patch, added);
              return combineElements(current, added);
            });
          });
        });
        return resolved;
      });
      return { response, getPatch: () => patch };
    },
    [mergeElements],
  );
};
