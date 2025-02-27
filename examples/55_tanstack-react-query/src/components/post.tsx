'use client';

import { useQuery } from '@tanstack/react-query';
import { postQueryOptions } from '../utils/posts';
import { Link } from 'waku';
import { useEffect } from 'react';

export function Post({ id }: { id: number }) {
  const { data, error } = useQuery(postQueryOptions({ id }));

  useEffect(() => {
    if (error) {
      console.error(error);
    }
  }, [error]);

  if (!data) {
    return <h1>Not found</h1>;
  }

  return (
    <>
      <title>{data.title}</title>
      <div className="space-y-2">
        <div>
          <Link to="/posts">Back</Link>
        </div>
        <h4 className="text-xl font-bold underline">{data.title}</h4>
        <div className="text-sm">{data.body}</div>
        <Link
          to={`/posts/${data.id}/deep`}
          className="text-blue-800 hover:text-blue-600 block py-1 active:font-bold active:text-black"
        >
          Deep View
        </Link>
      </div>
    </>
  );
}
