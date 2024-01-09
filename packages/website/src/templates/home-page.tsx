import { readFileSync } from 'node:fs';
// @ts-expect-error no exported member
import { compileMDX } from 'next-mdx-remote/rsc';

import { components } from '../components/mdx.js';
import { Start } from '../components/start.js';
import { Page } from '../components/page.js';

export const HomePage = async () => {
  const fileName = '../../README.md';
  const file = readFileSync(fileName, 'utf8');
  const source = `## Introduction${file
    .split('## Introduction')[1]
    ?.split('## Tweets')[0]}`;
  const mdx = await compileMDX({
    source,
    components,
    options: { parseFrontmatter: true },
  });
  const { content } = mdx;

  return (
    <>
      <title>Waku</title>
      <Page
        hero={
          <div className="relative flex h-[100svh] w-full flex-col items-center justify-center overflow-clip font-sans">
            <div className="pt-8 text-center text-white">
              <h1 className="text-shadow -ml-4 font-serif text-8xl font-extrabold leading-none sm:text-[10rem]">
                Waku
              </h1>
              <h3 className="text-shadow text-xl font-bold leading-none text-white/80 sm:-mt-2 sm:text-3xl">
                The minimal React framework
              </h3>
              <div className="mt-4 px-12 sm:mt-4 sm:px-0">
                <Start />
              </div>
            </div>
            <div className="sr-only" suppressHydrationWarning>
              {new Date().toISOString()}
            </div>
          </div>
        }
      >
        {content}
      </Page>
    </>
  );
};
