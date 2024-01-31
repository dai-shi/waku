import { Link } from 'waku';
import { readdirSync, readFileSync } from 'node:fs';
// @ts-expect-error no exported member
import { compileMDX } from 'next-mdx-remote/rsc';

import { Page } from '../components/page.js';
import { Meta } from '../components/meta.js';
import { components } from '../components/mdx.js';

type BlogArticlePageProps = {
  slug: string;
};

export const BlogArticlePage = async ({ slug }: BlogArticlePageProps) => {
  const fileName = await getFileName(slug);

  if (!fileName) return null;

  const path = `./contents/${fileName}`;
  const source = readFileSync(path, 'utf8');
  const mdx = await compileMDX({
    source,
    components,
    options: { parseFrontmatter: true },
  });
  const { frontmatter, content } = mdx;

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
      <div className="relative z-10 mx-auto w-full max-w-[80ch] pt-16 text-white lg:pt-64">
        <div className="mb-8 flex items-center gap-4">
          {frontmatter.release && (
            <div>
              <div className="inline-block rounded-md bg-white px-2 py-1 text-[0.625rem] font-black uppercase tracking-wide text-black sm:text-xs">
                Waku v{frontmatter.release}
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
      <div className="relative z-10 mx-auto w-full max-w-[80ch] pt-8 lg:pt-16">
        {content}
      </div>
      <div className="relative z-10 mx-auto mb-8 mt-16 flex w-full max-w-[80ch] justify-center sm:mb-0 lg:mt-32">
        <Link
          to="/"
          className="text-shadow !inline-block -rotate-[5deg] transform whitespace-nowrap text-center font-serif text-3xl font-extrabold leading-none text-white transition-colors duration-300 ease-in-out hover:text-primary sm:mr-4 sm:text-6xl"
        >
          Waku-Waku!
        </Link>
      </div>
    </Page>
  );
};

const getAuthor = (author: string) => {
  switch (author) {
    case 'daishi':
      return {
        name: `Daishi Kato`,
        biography: `author of Zustand and Jotai`,
        avatar: `https://cdn.candycode.com/waku/daishi.png`,
        url: `https://x.com/dai_shi`,
      };
    case 'sophia':
      return {
        name: `Sophia Andren`,
        biography: `technical director of candycode`,
        avatar: `https://cdn.candycode.com/waku/sophia.png`,
        url: `https://x.com/razorbelle`,
      };
    default:
      return {
        name: ``,
        biography: ``,
        avatar: ``,
      };
  }
};

const getFileName = async (slug: string) => {
  const blogFileNames: Array<string> = [];
  const blogSlugToFileName: Record<string, string> = {};

  readdirSync('./contents').forEach((fileName) => {
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
    blogSlugToFileName[frontmatter.slug] = fileName;
  }

  const fileName = blogSlugToFileName[slug];

  return fileName;
};
