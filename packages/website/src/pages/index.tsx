// @ts-expect-error no exported member
import { compileMDX } from 'next-mdx-remote/rsc';

import { Page } from '../components/page.js';
import { Meta } from '../components/meta.js';
import { components } from '../components/mdx.js';
import { Start } from '../components/start.js';
import { Destination } from '../components/destination.js';
import { loadReadme } from '../lib/load-readme.js';

export default async function HomePage() {
  const file = loadReadme();
  const source = `## Introduction${file.split('## Introduction')[1]}`;
  const mdx = await compileMDX({
    source,
    components,
    options: { parseFrontmatter: true },
  });
  const { content } = mdx;

  return (
    <Page isHome={true}>
      <Meta
        title="Waku, the minimal React framework"
        description="A lightweight alternative React framework with a fast developer experience. Loved by React developers at startups and agencies."
      />
      <div className="relative flex h-svh w-full flex-col items-center justify-center overflow-clip font-sans">
        <Start />
        <div className="sr-only" suppressHydrationWarning>
          {new Date().toISOString()}
        </div>
      </div>
      <div
        id="content"
        className="relative z-10 mx-auto w-full max-w-[80ch] scroll-mt-16 lg:scroll-mt-32"
      >
        {content}
      </div>
      <div className="relative z-10 mx-auto mb-8 mt-16 flex w-full max-w-[80ch] justify-center sm:mb-0 lg:mt-32">
        <a
          href="https://github.com/dai-shi/waku"
          target="_blank"
          rel="noreferrer"
          className="text-shadow !inline-block -rotate-[5deg] transform whitespace-nowrap text-center font-serif text-3xl font-extrabold leading-none text-white transition-colors duration-300 ease-in-out hover:text-primary sm:mr-4 sm:text-6xl"
        >
          star Waku on GitHub!
        </a>
      </div>
      <Destination />
    </Page>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
