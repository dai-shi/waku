"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Provider, useStore } from "jotai/react";
import type { Atom } from "jotai/vanilla";

interface JSONArray extends ReadonlyArray<JSONArray> {}
type JSONValue =
  | string
  | boolean
  | number
  | null
  | JSONArray
  | { [key: string]: JSONValue };

export type AnyAtom = Atom<JSONValue>;
export type AtomId = number;
export type AtomValues = readonly (readonly [
  atomId: AtomId,
  atomValue: JSONValue
])[];

const ClientContext = createContext<
  readonly [AtomValues, (next: AtomValues) => void] | null
>(null);

const Rerenderer = ({ children }: { children: ReactNode }) => {
  const [values, setValues] = useState<AtomValues>([]);
  return (
    <ClientContext.Provider value={[values, setValues]}>
      {children}
    </ClientContext.Provider>
  );
};

export function useAtomValues() {
  const context = useContext(ClientContext);
  if (!context) {
    throw new Error("Missing ClientProvider");
  }
  return context[0];
}

export function RegisterAtoms({
  atoms,
}: {
  atoms: readonly (readonly [AtomId, AnyAtom])[];
}) {
  const context = useContext(ClientContext);
  if (!context) {
    throw new Error("Missing ClientProvider");
  }
  const [, setValues] = context;
  const store = useStore();
  useEffect(() => {
    const callback = () => {
      setValues(atoms.map(([id, atom]) => [id, store.get(atom)]));
    };
    const unsubs = atoms.map(([, atom]) => store.sub(atom, callback));
    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [atoms, store, setValues]);
  return null;
}

export function ClientProvider({ children }: { children: ReactNode }) {
  return (
    <Provider>
      <Rerenderer>{children}</Rerenderer>
    </Provider>
  );
}
