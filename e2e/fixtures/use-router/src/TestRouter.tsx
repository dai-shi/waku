'use client';

import { Link, useRouter_UNSTABLE } from 'waku';

export default function TestRouter() {
  const router = useRouter_UNSTABLE();
  // TODO: Why is this necessary? On the client `searchParams`
  //       is a URLSearchParams object, but on the server it's an array.
  //       Without explicitly converting it to a URLSearchParams object,
  //       the code will break on the server because 'get' is not a function.
  const params = new URLSearchParams(router.searchParams);
  const queryCount = parseInt(params.get('count') || '0');
  return (
    <>
      <p data-testid="path">Path: {router.path}</p>
      <p data-testid="query">Query: {queryCount}</p>
      <p>
        <Link to={`?count=${queryCount + 1}`}>Increment query</Link>
      </p>
      <p>
        <button onClick={() => router.push(`?count=${queryCount + 1}`)}>
          Increment query (push)
        </button>
      </p>
    </>
  );
}
