import { atom } from 'jotai/vanilla';

import { countAtom } from "./baseAtoms.js";

export const doubleCountAtom = atom((get) => get(countAtom) * 2);
