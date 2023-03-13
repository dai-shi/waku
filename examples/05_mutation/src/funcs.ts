"use server";

import { rerender } from "wakuwork/server";

// module state on server
let counter = 0;

export const getCounter = () => counter;

export const increment = () => {
  counter += 1;
  return rerender();
}
