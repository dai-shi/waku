import { Link } from 'waku';
import { Posts } from '../../components/posts';
import { postsQueryOptions } from '../../utils/posts';
import { makeQueryClient } from '../../utils/query-client';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { ClientHydrationBoundary } from '../../components/hydration-boundary';

export default async function PostsPage({ query }) {
  const queryParams = new URLSearchParams(query);
  const start = queryParams.has('start')
    ? Number.parseInt(queryParams.get('start') || '') || 0
    : 0;
  let limit = queryParams.has('limit')
    ? Number.parseInt(queryParams.get('limit') || '') || 50
    : 50;
  if (limit > 500) {
    limit = 500;
  }
  const queryClient = makeQueryClient();
  queryClient.prefetchQuery(postsQueryOptions({ start, limit }));
  const now = new Date().toISOString();

  const state = dehydrate(queryClient);

  return (
    <div>
      <title>Posts</title>
      <h1 className="text-4xl font-bold tracking-tight">Posts for ${now}</h1>
      <ClientHydrationBoundary state={state}>
        <Posts />
      </ClientHydrationBoundary>
      <Link to="/" className="mt-4 inline-block underline">
        Return home
      </Link>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
