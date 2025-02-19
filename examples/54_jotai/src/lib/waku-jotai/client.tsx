'use client';

import { useEffect, useRef } from 'react';
import { useRefetch } from 'waku/minimal/client';
import { atom, useStore } from 'jotai';
import type { Atom } from 'jotai';

export const SyncAtoms = ({
  atomsPromise,
}: {
  atomsPromise: Promise<Map<Atom<unknown>, string>>;
}) => {
  const store = useStore();
  const refetch = useRefetch();
  const prevAtomValues = useRef<Map<Atom<unknown>, unknown>>(new Map());
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    atomsPromise.then((atoms) => {
      if (controller.signal.aborted) {
        return;
      }
      const atomValuesAtom = atom(
        (get) =>
          new Map<Atom<unknown>, unknown>(
            Array.from(atoms).map(([a]) => [a, get(a)]),
          ),
      );
      const callback = (atomValues: Map<Atom<unknown>, unknown>) => {
        prevAtomValues.current = atomValues;
        const rscParams = new Map(
          Array.from(atomValues).map(([a, value]) => [atoms.get(a)!, value]),
        );
        // TODO rscPath==='' is hardcoded
        refetch('', rscParams);
      };
      const unsub = store.sub(atomValuesAtom, () => {
        callback(store.get(atomValuesAtom));
      });
      const atomValues = store.get(atomValuesAtom);
      // HACK check if atom values have already been changed
      if (
        Array.from(atomValues).some(([a, value]) =>
          prevAtomValues.current.has(a)
            ? prevAtomValues.current.get(a) !== value
            : 'init' in a && a.init !== value,
        )
      ) {
        callback(atomValues);
      }
      controller.signal.addEventListener('abort', () => {
        unsub();
      });
    });
    return () => controller.abort();
  }, [store, atomsPromise, refetch]);
  return null;
};
