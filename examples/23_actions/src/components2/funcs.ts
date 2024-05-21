'use server';

import { rerender, getContext } from 'waku/server';

export const greet = async (name: string) => {
  await Promise.resolve();
  console.log('RSC Context:', getContext()); // ---> {}
  return `Hello ${name} from server!`;
};

// module state on server
let counter = 0;

export const getCounter = () => counter;

export const increment = () => {
  counter += 1;
  rerender('Waku');
};
