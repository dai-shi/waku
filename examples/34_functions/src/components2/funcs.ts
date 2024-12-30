'use server';

import { rerender } from '../als';

export const greet = async (name: string) => {
  await Promise.resolve();
  return `Hello ${name} from server!`;
};

// module state on server
let counter = 0;

export const getCounter = async () => counter;

export const increment = async () => {
  counter += 1;
  rerender('Waku');
};
