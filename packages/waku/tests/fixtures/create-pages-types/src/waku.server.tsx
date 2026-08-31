import { createPages } from 'waku';
import adapter from 'waku/adapters/default';
import type { PathsForPages } from 'waku/router';
import { NotFoundPage } from './not-found-page.js';
import { PostPage } from './post-page.js';

const pages = createPages(async ({ createPage }) => [
  createPage({
    render: 'dynamic',
    path: '/',
    component: () => <p>Home</p>,
  }),
  createPage({
    render: 'dynamic',
    path: '/posts/[id]',
    component: PostPage,
  }),
  createPage({
    render: 'static',
    path: '/404',
    component: NotFoundPage,
  }),
]);

declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<typeof pages>;
  }
}

export default adapter(pages);
