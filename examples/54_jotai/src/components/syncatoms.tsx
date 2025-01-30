'use client';

import { Suspense, use, useEffect } from 'react';
import { useElement, useRefetch } from 'waku/minimal/client';
import { atom, useStore } from 'jotai';
import type { Atom } from 'jotai';

const SyncAtomsInternal = () => {
  const store = useStore();
  const atomsPromises = useElement('atomsPromise') as Promise<Atom<unknown>[]>;
  const atoms = use(atomsPromises);
  const refetch = useRefetch();
  useEffect(() => {
    const atomValuesAtom = atom((get) => atoms.map(get));
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
