'use server';

import { unstable_rerenderRoute } from 'waku/router/server';
import { incrementRerenderOrderCount } from './rerender-order-store.js';

const PAGES = ['/nested/foo', '/nested/bar', '/nested/aaa', '/nested/bbb'];

export const jump = async () => {
  const page = PAGES[Math.floor(Math.random() * PAGES.length)] as string;
  console.log(`Jumping to ${page}`);
  unstable_rerenderRoute(page);
};

export const jumpToNestedBaz = async () => {
  unstable_rerenderRoute('/nested/baz');
};

export const throws = async (input: string): Promise<string> => {
  if (!input) {
    throw new Error('Input is required');
  }
  return input;
};

// wakujs/waku#2288
export const bumpRerenderOrder = async (mode: string) => {
  incrementRerenderOrderCount(mode);
  unstable_rerenderRoute(`/rerender-${mode}`);
};
