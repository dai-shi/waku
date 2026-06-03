'use server';

import { getRequest } from '../als';

export const greet = async (name: string) => {
  await Promise.resolve();
  return `Hello ${name} from server!`;
};

export const hello = async (name: string) => {
  await Promise.resolve();
  console.log('Request:', getRequest());
  console.log('Hello', name, '!');
};
