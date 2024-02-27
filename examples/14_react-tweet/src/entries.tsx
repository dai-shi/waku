import { createPages } from 'waku';

import { RootLayout } from './templates/root-layout.js';
import { HomePage } from './templates/home-page.js';

export default createPages(async ({ createPage, createLayout }) => {
  createLayout({
    render: 'static',
    path: '/',
    component: RootLayout,
  });

  createPage({
    render: 'static',
    path: '/',
    component: HomePage,
  });
});
