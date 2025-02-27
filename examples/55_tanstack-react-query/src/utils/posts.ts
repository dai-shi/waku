import { queryOptions } from '@tanstack/react-query';
import { fetchPost, fetchPosts, FetchPostsProps } from '../functions/posts';
import { useMemo } from 'react';

export const postsQueryOptions = ({ start = 0, limit = 50 }: FetchPostsProps) =>
  queryOptions({
    queryKey: ['posts', start, limit],
    queryFn: () => fetchPosts({ start, limit }),
  });

export const postQueryOptions = ({ id }: { id: number }) =>
  queryOptions({
    queryKey: ['post', id],
    queryFn: () => fetchPost({ id }),
  });

export const usePostsSearchQuery = (query: string): FetchPostsProps => {
  return useMemo(() => {
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
    return { start, limit };
  }, [query]);
};
