import type { RenderContext } from 'waku/server';

// module state on server
let counter = 0;

export function increment (this: RenderContext) {
  "use server";
  counter += 1;
  this.rerender('Waku');
}

export const getCounter = () => {
  "use server";
  return counter;
}
