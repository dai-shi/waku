import { GuideList } from '../../components/guide-list';
import type { GuideSectionProps } from '../../components/guide-list';
import { Meta } from '../../components/meta';
import { Page } from '../../components/page';
import { PostListContainer } from '../../components/post-list';
import { loadGuides } from '../../lib/load-docs';

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

const getGuideSections = async (): Promise<GuideSectionProps[]> => {
  const categories = new Map<string, GuideSectionProps['guides']>();
  for (const guide of await loadGuides()) {
    if (guide.hidden) {
      continue;
    }

    const category = guide.category || 'Other';
    const categoryGuides = categories.get(category) || [];
    categoryGuides.push({
      slug: guide.slug,
      title: guide.title,
      description: guide.description,
      tags: guide.tags ?? [],
    });
    categories.set(category, categoryGuides);
  }

  return Array.from(categories, ([category, guides]) => ({
    category,
    guides,
  }));
};

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
