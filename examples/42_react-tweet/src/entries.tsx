import { createPages } from 'waku/router/server';

import { RootLayout } from './templates/root-layout';
import { HomePage } from './templates/home-page';

export default createPages(async ({ createPage, createLayout }) => [
  createLayout({
    render: 'static',
    path: '/',
    component: RootLayout,
  }),

  createPage({
    render: 'static',
    path: '/',
    component: HomePage,
  }),
]);
