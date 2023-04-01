// TODO This is a temporary workaround.

import { atom } from "jotai/vanilla";

import { merge } from "../lib/jotai-rsc/server.js";

import { countAtom as clientCountAtom } from "./baseAtoms.js";

export const countAtom = merge(atom(10), clientCountAtom);
