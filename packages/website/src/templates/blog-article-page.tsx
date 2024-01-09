import { readdirSync, readFileSync } from 'node:fs';
// @ts-expect-error no exported member
import { compileMDX } from 'next-mdx-remote/rsc';

import { components } from '../components/mdx.js';
import { Page } from '../components/page.js';

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

  return (
    <>
      <title>{frontmatter.title}</title>
      <Page>
        <div className=" text-white">
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
            className="text-red-400 mx-auto mb-8 mt-4 inline-flex items-center justify-center gap-2 hover:underline sm:mb-12 sm:mt-4"
          >
            <div className="relative h-8 w-8 overflow-clip rounded-full border border-gray-500">
              <img
                src={author.avatar}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
            <div className="text-sm font-normal text-white/80 sm:text-lg lg:text-xl">
              by {author.name}, {author.biography}
            </div>
          </a>
        </div>
        {content}
      </Page>
    </>
  );
};

const getAuthor = (author: string) => {
  switch (author) {
    case 'daishi':
      return {
        name: `Daishi Kato`,
        biography: `author of Zustand and Jotai`,
        avatar: `https://storage.googleapis.com/candycode/jotai/daishi.png`,
        url: `https://x.com/dai_shi`,
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
