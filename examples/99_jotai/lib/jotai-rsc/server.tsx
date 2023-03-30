import { atom, createStore } from "jotai/vanilla";
import type { ExtractAtomValue } from "jotai/vanilla";

type Store = ReturnType<typeof createStore>;

import { RegisterAtoms } from "./client.js";
import type { AnyAtom, AtomId, AtomValues } from "./client.js";

// Hmm, this conflicts accross sessions.
let context:
  | readonly [
      store: Store,
      atomValues: AtomValues,
      nextAtoms: (readonly [AtomId, AnyAtom])[]
    ]
  | null = null;

export function serverHoc<Fn extends (props: any) => any>(fn: Fn) {
  return (props: unknown) => {
    const store = createStore();
    const atomValues: AtomValues = (props as any)?.atomValues || [];
    const nextAtoms: [AtomId, AnyAtom][] = [];
    context = [store, atomValues, nextAtoms];
    const result = fn(props);
    context = null;
    return (
      <>
        {result}
        <RegisterAtoms atoms={nextAtoms} />
      </>
    );
  };
}

let nextAtomId = 0;
const atomIdCache = new WeakMap<AnyAtom, AtomId>();
const getAtomId = (anAtom: AnyAtom) => {
  let id = atomIdCache.get(anAtom);
  if (id === undefined) {
    id = nextAtomId++;
    atomIdCache.set(anAtom, id);
  }
  return id;
};

export function readAtomValue<AtomType extends AnyAtom>(anAtom: AtomType) {
  if (!context) {
    throw new Error("Missing serverHoc");
  }
  // if (!("init" in anAtom)) {
  // throw new Error("Derived atoms are not supported yet.");
  // }
  const [store, atomValues, nextAtoms] = context;
  const { $$typeof, $$id, $$async, name } = anAtom as any;
  const atomClientReference = { $$typeof, $$id, $$async, name };
  const atomId = getAtomId(anAtom);
  if (!nextAtoms.some(([id]) => id === atomId)) {
    nextAtoms.push([atomId, atomClientReference as any]);
  }
  const found = atomValues.find(([id]) => id === atomId);
  if (found) {
    return found[1] as ExtractAtomValue<AtomType>;
  }
  // return store.get(anAtom) as ExtractAtomValue<AtomType>;
  return store.get(atom(undefined)) as ExtractAtomValue<AtomType>;
}
