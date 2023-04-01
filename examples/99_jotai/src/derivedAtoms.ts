import { atom } from 'jotai/vanilla';

import { countAtom } from "./mergedAtoms.js";

export const doubleCountAtom = atom((get) => get(countAtom) * 2);
