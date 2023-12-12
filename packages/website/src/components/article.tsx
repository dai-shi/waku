import { existsSync, readFileSync } from 'node:fs';
// @ts-expect-error no exported member
import { MDXRemote } from 'next-mdx-remote/rsc';

import { components } from './mdx.js';

export const Article = () => {
  const fname = existsSync('./contents')
    ? './contents/post-001.mdx'
    : './src/contents/post-001.mdx';
  const source = readFileSync(fname, 'utf8');

  return (
    <MDXRemote
      source={source}
      components={components}
      options={{ parseFrontmatter: true }}
    />
  );
};
