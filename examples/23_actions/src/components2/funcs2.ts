'use server';

import { getContext } from 'waku/server';

export const greet = async (name: string) => {
  await Promise.resolve();
  console.log('RSC Context:', getContext()); // ---> {}
  return `Hello ${name} from server!`;
};
