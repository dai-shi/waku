import type { Atom, ExtractAtomValue } from "jotai/vanilla";

import { RegisterAtoms } from "./client.js";
import type { AnyAtom, AtomId, AtomValues, JSONValue } from "./client.js";

// TODO This should be avoidable if we create a custom handler for "use client".
export function merge<T extends AnyAtom>(atomOnServer: T, atomOnClient: T): T {
  const { $$typeof, $$id, $$async, name } = atomOnClient as any;
  return Object.assign(atomOnServer, {
    $$typeof,
    $$id,
    $$async,
    name,
  });
}

const isClientReference = (x: any) => !!x?.["$$typeof"];

const hasInitialValue = <T extends Atom<any>>(
  atom: T,
): atom is T & (T extends Atom<any> ? { init: JSONValue } : never) =>
  "init" in atom;

// TODO this is a simplified version for now to experiment.
const createStore = () => {
  const atomMap = new Map<Atom<unknown>, unknown>();
  const get = (anAtom: AnyAtom): JSONValue => {
    const getter = <T,>(a: Atom<T>): T => {
      if (a === anAtom) {
        if (atomMap.has(a)) {
          return atomMap.get(a) as T;
        }
        if (hasInitialValue(a)) {
          atomMap.set(a, a.init);
          return a.init as T;
        }
        throw new Error("no atom init");
      }
      return get(a as AnyAtom) as T;
    };
    return anAtom.read(getter, {} as any);
  };
  const restore = (anAtom: AnyAtom, value: JSONValue): void => {
    if (hasInitialValue(anAtom)) {
      atomMap.set(anAtom, value);
    }
  };
  const collect = (): AnyAtom[] =>
    Array.from(atomMap.keys()).filter(hasInitialValue) as AnyAtom[];
  return { get, restore, collect };
};
type Store = ReturnType<typeof createStore>;

// HACK I hope we had a context that can be used within server.
// This hack only works for sync direct components.
let store: Store | null = null;

export function serverHoc<Fn extends (props: any) => any>(fn: Fn) {
  const ServerComponent = (props: unknown) => {
    store = createStore();
    const atomValues: AtomValues = (props as any)?.atomValues || [];
    for (const [id, value] of atomValues) {
      const anAtom = getAtomFromId(id);
      store.restore(anAtom, value);
    }
    const result = fn(props);
    const nextAtoms = store
      .collect()
      .flatMap((anAtom) =>
        isClientReference(anAtom) ? [[getAtomId(anAtom), anAtom] as const] : [],
      );
    store = null;
    return (
      <>
        {result}
        {/* HACK This is very limited. */}
        <RegisterAtoms atoms={nextAtoms} />
      </>
    );
  };
  return ServerComponent;
}

let nextAtomId = 0;
const atomIdCache = new WeakMap<AnyAtom, AtomId>();
// FIXME This causes memory leaks.
const idAtomCache = new Map<AtomId, AnyAtom>();
const getAtomId = (anAtom: AnyAtom) => {
  let id = atomIdCache.get(anAtom);
  if (id === undefined) {
    id = nextAtomId++;
    atomIdCache.set(anAtom, id);
    idAtomCache.set(id, anAtom);
  }
  return id;
};
const getAtomFromId = (id: AtomId) => {
  const anAtom = idAtomCache.get(id);
  if (anAtom === undefined) {
    throw new Error("No atom found for id: " + id);
  }
  return anAtom;
};

export function useAtomValue<T extends AnyAtom>(anAtom: T) {
  if (!store) {
    throw new Error("Missing serverHoc");
  }
  return store.get(anAtom) as ExtractAtomValue<T>;
}
