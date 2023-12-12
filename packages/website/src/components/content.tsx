import { existsSync, readFileSync } from 'node:fs';
// @ts-expect-error no exported member
import { MDXRemote } from 'next-mdx-remote/rsc';

import { components } from './mdx.js';

export const Content = () => {
  const fname = existsSync('./README.md') ? './README.md' : '../../README.md';
  const file = readFileSync(fname, 'utf8');
  const source = `## Introduction${file
    .split('## Introduction')[1]
    ?.split('## Tweets')[0]}`;

  return <MDXRemote source={source} components={components} />;
};
