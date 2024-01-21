'use server';

import type { RenderContext } from 'waku/server';

// module state on server
let counter = 0;

export const getCounter = () => counter;

export function increment(this: RenderContext) {
  counter += 1;
  this.rerender('Waku');
}
