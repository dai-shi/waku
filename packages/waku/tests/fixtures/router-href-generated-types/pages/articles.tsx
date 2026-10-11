import type { PageProps } from 'waku/router';

export const getConfig = () =>
  ({ render: 'static', staticPaths: ['intro', 'advanced'] }) as const;

export default function ArticlePage({ slug }: PageProps<'/articles/[slug]'>) {
  return <p>{slug}</p>;
}
