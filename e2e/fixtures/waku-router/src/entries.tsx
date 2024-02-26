import { createPages } from 'waku/router/server';

import { RootLayout } from './pages/root-layout.js';
import { HomePage } from './pages/home-page.js';
import { AboutPage } from './pages/about-page.js';
import { RoomPage } from './pages/room-page.js';

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

  createPage({
    render: 'static',
    path: '/about',
    component: AboutPage,
  });

  createPage({
    render: 'dynamic',
    path: '/[roomId]',
    component: RoomPage,
  });
});
