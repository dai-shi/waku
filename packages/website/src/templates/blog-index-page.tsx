import { Link } from 'waku';
import { readdirSync, readFileSync } from 'node:fs';
// @ts-expect-error no exported member
import { compileMDX } from 'next-mdx-remote/rsc';

import { Page } from '../components/page.js';
import { Meta } from '../components/meta.js';
import { getAuthor } from '../lib/get-author.js';

export const BlogIndexPage = async () => {
  const articles = await getArticles();

  return (
    <Page>
      <Meta title="Waku blog" description="The official Waku developer blog." />
      <div className="relative z-10 mx-auto w-full max-w-[80ch] pt-16 text-white lg:pt-64">
        <ul className="space-y-12 divide-y divide-gray-800">
          {articles.map((article) => (
            <li key={article.key} className="pt-12 first:-mt-12">
              <Link to={`/blog/${article.slug}`} className="group">
                <div className="flex items-center gap-2 whitespace-nowrap sm:gap-4">
                  {article.release && (
                    <div>
                      <div className="inline-block rounded-md bg-white px-2 py-1 text-[0.625rem] font-black tracking-wide text-black sm:text-xs">
                        <span className="hidden uppercase sm:inline">Waku</span>{' '}
                        v{article.release}
                      </div>
                    </div>
                  )}
                  <div className="inline-flex items-center gap-1 font-simple text-[11px] uppercase tracking-[0.125em] text-gray-400 sm:gap-4">
                    <span>{article.date}</span>
                    <span className="text-gray-600">/</span>
                    <span>{article.author.name}</span>
                  </div>
                </div>
                <h3 className="mt-6 font-serif text-2xl font-extrabold leading-none transition-colors duration-300 ease-in-out group-hover:text-primary sm:text-4xl">
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
};

const getArticles = async () => {
  const blogFileNames: Array<string> = [];
  const blogArticles: Array<any> = [];

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
