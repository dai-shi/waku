import { Link } from 'waku';
import { Post } from '../../../components/post';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { makeQueryClient } from '../../../utils/query-client';
import { postQueryOptions } from '../../../utils/posts';
import { Suspense } from 'react';

export default async function PostPage({ id }: { id: number }) {
  const queryClient = makeQueryClient();
  queryClient.prefetchQuery(postQueryOptions({ id }));

  return (
    <div>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <Suspense fallback={<div>Loading...</div>}>
          <Post id={id} />
        </Suspense>
      </HydrationBoundary>
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
