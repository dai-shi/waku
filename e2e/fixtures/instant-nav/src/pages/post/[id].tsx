import type { PageProps } from 'waku/router';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function Post({ id }: PageProps<'/post/[id]'>) {
  await sleep(600);
  return <div data-testid="post-body">Post {id}</div>;
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
    // Etag keyed on the slug, so an instant revisit exercises dynamic-etag
    // handling: a stale cached etag must not skip a since-changed slot.
    unstable_getEtag: async ({ id }: { id: string }) => id,
  } as const;
};
