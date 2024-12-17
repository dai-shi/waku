'use server';

import { unstable_rerenderRoute } from 'waku/router/server';

const PAGES = ['/bar', '/baz', '/nested/qux', '/nested/aaa', '/nested/bbb'];

export const jump = async () => {
  const page = PAGES[Math.floor(Math.random() * PAGES.length)] as string;
  console.log(`Jumping to ${page}`);
  unstable_rerenderRoute(page);
};
