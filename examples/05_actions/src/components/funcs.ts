'use server';

import { rerender } from 'waku/server';

export const greet = (name: string) => `Hello ${name} from server!`;

// module state on server
let counter = 0;

export const getCounter = () => counter;

export const increment = () => {
  counter += 1;
  rerender('Waku');
};
