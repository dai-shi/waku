'use server';

import { unstable_getCustomContext as getCustomContext } from 'waku/server';

export const greet = async (name: string) => {
  await Promise.resolve();
  return `Hello ${name} from server!`;
};

export const hello = async (name: string) => {
  await Promise.resolve();
  console.log('Custom Context:', getCustomContext()); // ---> {}
  console.log('Hello', name, '!');
};
