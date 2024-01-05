import { readdirSync, readFileSync } from 'node:fs';
import { createPages } from 'waku/router/server';
// @ts-expect-error no exported member
import { compileMDX } from 'next-mdx-remote/rsc';

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
  const blogFileNames: Array<string> = [];

  readdirSync('./contents').forEach((fileName: string) => {
    blogFileNames.push(fileName);
  });

  for await (const fileName of blogFileNames) {
    const path = `./contents/${fileName}`;
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
