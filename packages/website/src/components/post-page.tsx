import { readFileSync } from 'node:fs';
import { compileMDX } from '../lib/compile-mdx';
import { getAuthor } from '../lib/get-author';
import { getFileName } from '../lib/get-file-name';
import type { GuideTag } from '../types';
import { GuideTags } from './guide-list';
import { components } from './mdx';
import { Meta } from './meta';
import { Page } from './page';
import { StarWaku } from './star-waku';

export async function compilePost({
  slug,
  folder,
}: {
  slug: string;
  folder: string;
}) {
  const fileName = await getFileName(folder, slug);

  if (!fileName) {
    return null;
  }

  const path = `${folder}/${fileName}`;
  const source = readFileSync(path, 'utf8');
  const mdx = await compileMDX({
    source,
    components,
    options: { parseFrontmatter: true },
  });
  const { content } = mdx;
  const frontmatter = mdx.frontmatter as {
    slug: string;
    title: string;
    description: string;
    date?: string;
    author?: string;
    release?: string;
    tags?: GuideTag[];
  };

  const author = frontmatter.author ? getAuthor(frontmatter.author) : undefined;
  const date = frontmatter.date
    ? new Date(frontmatter.date).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : undefined;
  return { content, frontmatter, author, date };
}

export async function PostPage({
  slug,
  folder,
  ogImageUrl,
}: {
  slug: string;
  folder: string;
  ogImageUrl?: string;
}) {
  const compiled = await compilePost({ folder, slug });
  if (!compiled) {
    return null;
  }

  const { content, frontmatter, author, date } = compiled;

  return (
    <Page>
      <Meta
        title={`${frontmatter.title} — Waku`}
        description={frontmatter.description}
        ogImageUrl={ogImageUrl}
      />
      <meta property="twitter:card" content="summary_large_image" />
      <div className="relative z-10 mx-auto w-full max-w-[80ch] pt-16 text-white lg:pt-36 xl:-right-[calc(296px/2)] 2xl:right-auto">
        <div className="mb-8 flex items-center gap-2 sm:gap-4">
          {frontmatter.release && (
            <div>
              <div className="inline-block rounded-md bg-white px-2 py-1 font-simple text-[0.625rem] font-bold text-black sm:text-xs">
                <span className="hidden uppercase sm:inline">Waku</span>{' '}
                {frontmatter.release}
              </div>
            </div>
          )}
          {date && (
            <div className="font-label text-[11px] text-gray-400">{date}</div>
          )}
        </div>
        <h1 className="font-headline text-pretty text-3xl leading-none sm:text-6xl">
          {frontmatter.title}
        </h1>
        <h3 className="mt-2 text-lg font-normal leading-snug text-white/60 sm:mt-1 sm:text-xl sm:font-bold">
          {frontmatter.description}
        </h3>
        {frontmatter.tags && frontmatter.tags.length > 0 && (
          <div className="mt-4">
            <GuideTags tags={frontmatter.tags} />
          </div>
        )}
        {author && (
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
            <div className="font-label text-[11px] text-gray-400 transition-colors duration-300 ease-in-out group-hover:text-white">
              by {author.name}
              <span className="hidden sm:inline">, </span>
              <br className="sm:hidden" />
              {author.biography}
            </div>
          </a>
        )}
        <hr className="mt-2 h-px border-none bg-gray-800" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[80ch] pt-8 lg:pt-16 xl:-right-[calc(296px/2)] 2xl:right-auto">
        {content}
      </div>
      <div className="relative z-10 mx-auto mb-8 mt-16 flex w-full max-w-[80ch] justify-center sm:mb-0 lg:mt-32 xl:-right-[calc(296px/2)] 2xl:right-auto">
        <StarWaku />
      </div>
    </Page>
  );
}
