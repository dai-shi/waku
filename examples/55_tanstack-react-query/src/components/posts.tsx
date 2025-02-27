'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { postsQueryOptions, usePostsSearchQuery } from '../utils/posts';
import { Link, useRouter_UNSTABLE as useRouter } from 'waku';

export function Posts() {
  const queryClient = useQueryClient();
  const { query } = useRouter();
  const queryOptions = usePostsSearchQuery(query);
  const { status, data, error, isFetching } = useQuery(
    postsQueryOptions(queryOptions),
  );
  console.log({ status, data, error, isFetching });

  return (
    <div>
      <h1>Posts</h1>
      <div>
        {status === 'pending' ? (
          'Loading...'
        ) : status === 'error' ? (
          <span>Error: {error.message}</span>
        ) : (
          <>
            <div>
              {data.map((post) => (
                <p key={post.id}>
                  <Link
                    to={`/posts/${post.id}`}
                    style={
                      // We can access the query data here to show bold links for
                      // ones that are cached
                      queryClient.getQueryData(['post', post.id])
                        ? {
                            fontWeight: 'bold',
                            color: 'green',
                          }
                        : {}
                    }
                  >
                    {post.title}
                  </Link>
                </p>
              ))}
            </div>
            <div>{isFetching ? 'Background Updating...' : ' '}</div>
          </>
        )}
      </div>
    </div>
  );
}
