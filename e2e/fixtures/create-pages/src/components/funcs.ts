'use server';

import { unstable_rerenderRoute } from 'waku/router/server';

const PAGES = ['/nested/foo', '/nested/bar', '/nested/aaa', '/nested/bbb'];

export const jump = async () => {
  const page = PAGES[Math.floor(Math.random() * PAGES.length)] as string;
  console.log(`Jumping to ${page}`);
  unstable_rerenderRoute(page);
};

export const throws = async (input: string): Promise<string> => {
  if (!input) {
    throw new Error('Something unexpected happened');
  }
  return input;
};
