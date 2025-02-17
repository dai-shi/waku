import { readFile } from 'node:fs/promises';

export const GET = async () => {
  const text = await readFile('./private/hi.txt');
  return new Response(text);
};
