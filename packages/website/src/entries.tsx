import { readdirSync, readFileSync } from 'node:fs';
import { createPages } from 'waku';
// @ts-expect-error no exported member
import { compileMDX } from 'next-mdx-remote/rsc';

import { RootLayout } from './templates/root-layout.js';
import { HomePage } from './templates/home-page.js';
import { BlogIndexPage } from './templates/blog-index-page.js';
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

  createPage({
    render: 'static',
    path: '/blog',
    component: BlogIndexPage,
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
  const blogFileNames: Array<string> = [];

  readdirSync('./private/contents').forEach((fileName) => {
    blogFileNames.push(fileName);
  });

  for await (const fileName of blogFileNames) {
    const path = `./private/contents/${fileName}`;
    const source = readFileSync(path, 'utf8');
    const mdx = await compileMDX({
      source,
      options: { parseFrontmatter: true },
    });
    const { frontmatter } = mdx;
    blogPaths.push(frontmatter.slug);
  }

  return blogPaths;
}
