'use server';

import { getContext } from 'waku/middleware/context';

export const greet = async (name: string) => {
  await Promise.resolve();
  return `Hello ${name} from server!`;
};

export const hello = async (name: string) => {
  await Promise.resolve();
  console.log('Context:', getContext());
  console.log('Hello', name, '!');
};
