import { readdirSync, readFileSync } from 'node:fs';
import { compileMDX } from 'next-mdx-remote/rsc';

import { Page } from '../../components/page';
import { Meta } from '../../components/meta';
import { components } from '../../components/mdx';
import { getAuthor } from '../../lib/get-author';
import type { BlogFrontmatter } from '../../types';

type BlogArticlePageProps = {
  slug: string;
};

export default async function BlogArticlePage({ slug }: BlogArticlePageProps) {
  const fileName = await getFileName(slug);

  if (!fileName) {
    return null;
  }

  const path = `./private/contents/${fileName}`;
  const source = readFileSync(path, 'utf8');
  const mdx = await compileMDX({
    source,
    components,
    options: { parseFrontmatter: true },
  });
  const { content } = mdx;
  const frontmatter = mdx.frontmatter as BlogFrontmatter;

  const author = getAuthor(frontmatter.author);
  const date = new Date(frontmatter.date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Page>
      <Meta
        title={`${frontmatter.title} — Waku`}
        description={frontmatter.description}
      />
      <div className="relative z-10 mx-auto w-full max-w-[80ch] pt-16 text-white lg:pt-36 xl:-right-[calc(296px/2)] 2xl:right-auto">
        <div className="mb-8 flex items-center gap-2 sm:gap-4">
          {frontmatter.release && (
            <div>
              <div className="inline-block rounded-md bg-white px-2 py-1 text-[0.625rem] font-black tracking-wide text-black sm:text-xs">
                <span className="hidden uppercase sm:inline">Waku</span>{' '}
                {frontmatter.release}
              </div>
            </div>
          )}
          <div className="font-simple text-[11px] uppercase tracking-[0.125em] text-gray-400">
            {date}
          </div>
        </div>
        <h1 className="font-serif text-3xl font-extrabold leading-none sm:text-6xl">
          {frontmatter.title}
        </h1>
        <h3 className="mt-2 text-lg font-normal leading-snug text-white/60 sm:mt-0 sm:text-xl sm:font-bold">
          {frontmatter.description}
        </h3>
        <a
          href={author.url}
          target="_blank"
          rel="noreferrer"
          className="group mx-auto mt-4 flex items-center gap-2 sm:mt-4"
        >
          <div className="relative size-8 overflow-clip rounded-full border border-gray-800 transition-colors duration-300 ease-in-out group-hover:border-white sm:size-6">
            <img
              src={author.avatar}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
          <div className="font-simple text-[11px] uppercase tracking-[0.125em] text-gray-400 transition-colors duration-300 ease-in-out group-hover:text-white">
            by {author.name}
            <span className="hidden sm:inline">, </span>
            <br className="sm:hidden" />
            {author.biography}
          </div>
        </a>
        <hr className="mt-2 h-px border-none bg-gray-800" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[80ch] pt-8 lg:pt-16 xl:-right-[calc(296px/2)] 2xl:right-auto">
        {content}
      </div>
      <div className="relative z-10 mx-auto mb-8 mt-16 flex w-full max-w-[80ch] justify-center sm:mb-0 lg:mt-32 xl:-right-[calc(296px/2)] 2xl:right-auto">
        <a
          href="https://github.com/dai-shi/waku"
          target="_blank"
          rel="noreferrer"
          className="text-shadow inline-block! -rotate-[5deg] transform whitespace-nowrap text-center font-serif text-3xl font-extrabold leading-none text-white transition-colors duration-300 ease-in-out hover:text-primary sm:mr-4 sm:text-6xl"
        >
          star Waku on GitHub!
        </a>
      </div>
    </Page>
  );
}

const getFileName = async (slug: string) => {
  const blogFileNames: Array<string> = [];
  const blogSlugToFileName: Record<string, string> = {};

  readdirSync('./private/contents').forEach((fileName) => {
    if (fileName.endsWith('.mdx')) {
      blogFileNames.push(fileName);
    }
  });

  for await (const fileName of blogFileNames) {
    const path = `./private/contents/${fileName}`;
    const source = readFileSync(path, 'utf8');
    const mdx = await compileMDX({
      source,
      options: { parseFrontmatter: true },
    });
    const frontmatter = mdx.frontmatter as BlogFrontmatter;
    blogSlugToFileName[frontmatter.slug] = fileName;
  }

  const fileName = blogSlugToFileName[slug];

  return fileName;
};

export const getConfig = async () => {
  const blogPaths = await getBlogPaths();

  return {
    render: 'static',
    staticPaths: blogPaths,
  } as const;
};

const getBlogPaths = async () => {
  const blogPaths: Array<string> = [];
  const blogFileNames: Array<string> = [];

  readdirSync('./private/contents').forEach((fileName) => {
    if (fileName.endsWith('.mdx')) {
      blogFileNames.push(fileName);
    }
  });

  for await (const fileName of blogFileNames) {
    const path = `./private/contents/${fileName}`;
    const source = readFileSync(path, 'utf8');
    const mdx = await compileMDX({
      source,
      options: { parseFrontmatter: true },
    });
    const frontmatter = mdx.frontmatter as BlogFrontmatter;
    blogPaths.push(frontmatter.slug);
  }

  return blogPaths;
};
