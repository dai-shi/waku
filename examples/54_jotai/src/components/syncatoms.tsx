'use client';

import { Suspense, use, useEffect } from 'react';
import { useElement, useRefetch } from 'waku/minimal/client';
import { atom, useStore } from 'jotai';
import type { Atom } from 'jotai';

const SyncAtomsInternal = () => {
  const store = useStore();
  const atomsPromises = useElement('atomsPromise') as Promise<
    Map<Atom<unknown>, string>
  >;
  // FIXME if atomsPromises resolves too late, we miss some atom updates.
  const atoms = use(atomsPromises);
  const refetch = useRefetch();
  useEffect(() => {
    const atomValuesAtom = atom(
      (get) =>
        new Map<string, unknown>(
          Array.from(atoms).map(([atom, id]) => [id, get(atom)]),
        ),
    );
    return store.sub(atomValuesAtom, () => {
      // TODO rscPath==='' is hardcoded
      refetch('', store.get(atomValuesAtom));
    });
  }, [store, atoms, refetch]);
  return null;
};

export const SyncAtoms = () => (
  <Suspense>
    <SyncAtomsInternal />
  </Suspense>
);
