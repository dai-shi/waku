import { readdirSync } from 'node:fs';
import { createPages } from 'waku/router/server';

import { RootLayout } from './templates/root-layout.js';
import { HomePage } from './templates/home-page.js';
import { BlogArticlePage } from './templates/blog-article-page.js';

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

  const blogPaths = await getBlogPaths();

  createPage({
    render: 'static',
    path: '/blog/[slug]',
    staticPaths: blogPaths,
    component: BlogArticlePage,
  });
});

async function getBlogPaths() {
  const blogPaths: Array<string> = [];
  readdirSync('../contents').forEach((file) => {
    // parse frontmatter, push frontmatter.slug to blogPaths
    console.log(file);
  });
  return blogPaths;

  // return ['introducing-waku'];
}
