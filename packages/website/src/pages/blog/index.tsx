import { Link } from 'waku';
import { readdirSync, readFileSync } from 'node:fs';
import { compileMDX } from 'next-mdx-remote/rsc';

import { Page } from '../../components/page';
import { Meta } from '../../components/meta';
import { getAuthor } from '../../lib/get-author';
import type { BlogFrontmatter } from '../../types';

export default async function BlogIndexPage() {
  const articles = await getArticles();

  return (
    <Page>
      <Meta title="Waku blog" description="The official Waku developer blog." />
      <div className="relative z-10 mx-auto w-full max-w-[80ch] pt-16 text-white lg:pt-36 xl:-right-[calc(296px/2)] 2xl:right-auto">
        <ul className="-mx-4 -mt-px flex flex-col gap-6 sm:-mx-6 md:-mx-12 lg:gap-12">
          {articles.map((article) => (
            <li
              key={article.slug}
              className="-mx-px first:-mt-4 sm:first:-mt-6 lg:first:-mt-12"
            >
              <Link
                to={`/blog/${article.slug}`}
                className="bg-gray-950/90 group block rounded-xl border border-gray-800 p-4 transition-colors duration-300 ease-in-out hover:border-secondary sm:p-6 lg:p-12"
              >
                <div className="flex items-center gap-2 whitespace-nowrap sm:gap-4">
                  {article.release && (
                    <div>
                      <div className="inline-block rounded-md bg-white px-2 py-1 text-[0.625rem] font-black tracking-wide text-black sm:text-xs">
                        <span className="hidden uppercase sm:inline">Waku</span>{' '}
                        {article.release}
                      </div>
                    </div>
                  )}
                  <div className="inline-flex items-center gap-1 font-simple text-[11px] uppercase tracking-[0.125em] text-gray-400 sm:gap-4">
                    <span>{article.date}</span>
                    <span className="text-gray-600">/</span>
                    <span>{article.author.name}</span>
                  </div>
                </div>
                <h3 className="mt-6 font-serif text-2xl font-extrabold leading-none sm:text-4xl">
                  {article.title}
                </h3>
                <div className="mt-2 text-sm font-normal leading-snug text-white/60 sm:mt-0 sm:text-base">
                  {article.description}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Page>
  );
}

const getArticles = async () => {
  const blogFileNames: Array<string> = [];
  const blogArticles: Array<any> = [];

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

    const author = getAuthor(frontmatter.author);
    const date = new Date(frontmatter.date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    const article = {
      slug: frontmatter.slug,
      title: frontmatter.title,
      description: frontmatter.description,
      author,
      release: frontmatter.release,
      date,
      rawDate: frontmatter.date,
    };

    blogArticles.push(article);
  }

  return blogArticles.sort((a, b) => (a.rawDate > b.rawDate ? -1 : 1));
};

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
