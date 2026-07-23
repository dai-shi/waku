import { readFileSync, readdirSync } from 'node:fs';
import type { GuideFrontmatter } from '../types';
import { compileMDX } from './compile-mdx';

const GUIDE_CATEGORY_ORDER = [
  'Getting Started',
  'Learn',
  'Advanced Setup',
  'Routing and Navigation',
  'Runtime and Middleware',
  'Integrations',
  'Low-level APIs',
  'Deployment',
];

type Guide = GuideFrontmatter & {
  content: string;
};

const getCategoryIndex = (category: string) => {
  const index = GUIDE_CATEGORY_ORDER.indexOf(category);
  return index === -1 ? GUIDE_CATEGORY_ORDER.length : index;
};

export const loadReadme = (): string => {
  const content = readFileSync('../../README.md', 'utf8');
  return content.replace(/\r\n?/g, '\n');
};

export const loadCreatePages = (): string => {
  const file = readFileSync('../../docs/create-pages.mdx', 'utf8');
  return file.replace(/\r\n?/g, '\n');
};

export const loadGuides = async (): Promise<Guide[]> => {
  const folder = '../../docs/guides';
  const fileNames = readdirSync(folder, {
    recursive: true,
    encoding: 'utf8',
  })
    .filter((fileName) => fileName.endsWith('.mdx'))
    .sort();

  const guides: Guide[] = [];
  for (const fileName of fileNames) {
    const source = readFileSync(`${folder}/${fileName}`, 'utf8').replace(
      /\r\n?/g,
      '\n',
    );
    const mdx = await compileMDX({
      source,
      options: { parseFrontmatter: true },
    });
    const frontmatter = mdx.frontmatter as GuideFrontmatter;
    guides.push({
      ...frontmatter,
      content: source.replace(/^---\n[\s\S]*?\n---\n*/, ''),
    });
  }

  return guides.sort((guideA, guideB) => {
    const categoryA = guideA.category || 'Other';
    const categoryB = guideB.category || 'Other';
    const categoryOrderDiff =
      getCategoryIndex(categoryA) - getCategoryIndex(categoryB);
    return (
      categoryOrderDiff ||
      categoryA.localeCompare(categoryB) ||
      (guideA.order ?? Number.MAX_SAFE_INTEGER) -
        (guideB.order ?? Number.MAX_SAFE_INTEGER) ||
      guideA.title.localeCompare(guideB.title) ||
      guideA.slug.localeCompare(guideB.slug)
    );
  });
};
