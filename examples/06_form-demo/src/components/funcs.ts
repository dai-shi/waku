import { readFile, writeFile } from 'node:fs/promises';
import { unstable_rerenderRoute } from 'waku/router/server';

export const getMessage = async () => {
  const data = await readFile('./private/message.txt', 'utf8');
  return data;
};

export const greet = async (formData: FormData) => {
  'use server';
  // simulate a slow server response
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const currentData = await getMessage();
  await writeFile(
    './private/message.txt',
    currentData + '\n' + formData.get('name') + ' from server!',
  );
  unstable_rerenderRoute('/');
};

export const increment = async (count: number) => {
  'use server';
  return count + 1;
};
