import { readFileSync, readdirSync } from 'node:fs';
import { GuideList } from '../../components/guide-list';
import type { GuideSectionProps } from '../../components/guide-list';
import { Meta } from '../../components/meta';
import { Page } from '../../components/page';
import { PostListContainer } from '../../components/post-list';
import { compileMDX } from '../../lib/compile-mdx';
import type { GuideFrontmatter } from '../../types';

const GUIDE_CATEGORY_ORDER = [
  'Getting Started',
  'Learn',
  'Advanced Setup',
  'Routing and Navigation',
  'Runtime and Middleware',
  'Low-level APIs',
  'Deployment',
];

export default async function GuidesIndexPage() {
  const guideSections = await getGuideSections();

  return (
    <Page>
      <Meta
        title="Waku guides"
        description="The guides for working with Waku."
      />
      <PostListContainer>
        <GuideList sections={guideSections} />
      </PostListContainer>
    </Page>
  );
}

const getCategoryIndex = (category: string) => {
  const index = GUIDE_CATEGORY_ORDER.indexOf(category);
  return index === -1 ? GUIDE_CATEGORY_ORDER.length : index;
};

const getGuideSections = async (): Promise<GuideSectionProps[]> => {
  const guideFileNames: Array<string> = [];
  const guides: Array<{
    slug: string;
    title: string;
    description: string;
    category: string;
    order: number;
    tags: NonNullable<GuideFrontmatter['tags']>;
  }> = [];

  readdirSync('../../docs/guides/', {
    recursive: true,
    encoding: 'utf8',
  }).forEach((fileName) => {
    if (fileName.endsWith('.mdx')) {
      guideFileNames.push(fileName);
    }
  });

  for await (const fileName of guideFileNames) {
    const path = `../../docs/guides/${fileName}`;
    const source = readFileSync(path, 'utf8');
    const mdx = await compileMDX({
      source,
      options: { parseFrontmatter: true },
    });
    const frontmatter = mdx.frontmatter as GuideFrontmatter;
    if (frontmatter.hidden) {
      continue;
    }

    guides.push({
      slug: frontmatter.slug,
      title: frontmatter.title,
      description: frontmatter.description,
      category: frontmatter.category || 'Other',
      order: frontmatter.order ?? Number.MAX_SAFE_INTEGER,
      tags: frontmatter.tags ?? [],
    });
  }

  const categories = new Map<string, typeof guides>();
  for (const guide of guides) {
    const categoryGuides = categories.get(guide.category) || [];
    categoryGuides.push(guide);
    categories.set(guide.category, categoryGuides);
  }

  return Array.from(categories)
    .sort(([categoryA], [categoryB]) => {
      const categoryOrderDiff =
        getCategoryIndex(categoryA) - getCategoryIndex(categoryB);
      return categoryOrderDiff || categoryA.localeCompare(categoryB);
    })
    .map(([category, categoryGuides]) => ({
      category,
      guides: categoryGuides
        .sort((guideA, guideB) => {
          const guideOrderDiff = guideA.order - guideB.order;
          return guideOrderDiff || guideA.title.localeCompare(guideB.title);
        })
        .map(({ order: _order, category: _category, ...guide }) => guide),
    }));
};

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
