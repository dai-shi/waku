import { cache } from 'react';
import type { ReactNode } from 'react';
import type { Atom } from 'jotai/vanilla';
import { INTERNAL_buildStore } from 'jotai/vanilla/internals';
import type { INTERNAL_AtomState as AtomState } from 'jotai/vanilla/internals';

import { SyncAtoms } from './client';

const CLIENT_REFERENCE_TAG = Symbol.for('react.client.reference');

type ClientReferenceId = string;

const getClientReferenceId = (a: Atom<unknown>) => {
  if ((a as any)['$$typeof'] === CLIENT_REFERENCE_TAG) {
    const id: ClientReferenceId = (a as any)['$$id'];
    return id;
  }
  return null;
};

export const getStore = cache(() => {
  const clientAtoms = new Map<Atom<unknown>, ClientReferenceId>();
  const clientAtomValues = new Map<ClientReferenceId, unknown>();
  const atomStateMap = new Map<Atom<unknown>, AtomState>();
  const store = INTERNAL_buildStore(
    (a) => atomStateMap.get(a) as never,
    (a, s) => {
      const id = getClientReferenceId(a);
      if (id) {
        clientAtoms.set(a, id);
        if (clientAtomValues.has(id)) {
          s.v = clientAtomValues.get(id) as never;
        }
      }
      atomStateMap.set(a, s);
    },
    (a, ...params) => a.read(...params),
    (a, ...params) => a.write(...params),
    (a, ...params) => a.unstable_onInit?.(...params),
    (a, ...params) => a.onMount?.(...params),
  );
  const getAtoms = () => clientAtoms;
  const setAtomValues = (values: Iterable<[ClientReferenceId, unknown]>) => {
    for (const [id, value] of values) {
      clientAtomValues.set(id, value);
    }
  };
  const waitForAtoms = async () => {
    let size: number;
    do {
      size = atomStateMap.size;
      await Promise.all(Array.from(atomStateMap.values()).map((s) => s.v));
    } while (size !== atomStateMap.size);
  };
  return Object.assign(store, {
    getAtoms,
    setAtomValues,
    waitForAtoms,
  });
});

export const Provider = ({
  children,
  rscParams,
}: {
  children: ReactNode;
  rscParams: unknown;
}) => {
  const atomValues = rscParams instanceof Map ? rscParams : new Map();
  let resolveAtoms: (m: Map<Atom<unknown>, string>) => void;
  const atomsPromise = new Promise<Map<Atom<unknown>, string>>((r) => {
    resolveAtoms = r;
  });
  const store = getStore();
  store.setAtomValues(atomValues);
  setTimeout(() => {
    store
      .waitForAtoms()
      .then(() => {
        const atoms = store.getAtoms();
        resolveAtoms(atoms);
      })
      .catch(() => {});
  });
  return (
    <>
      {children}
      <SyncAtoms atomsPromise={atomsPromise} />
    </>
  );
};
