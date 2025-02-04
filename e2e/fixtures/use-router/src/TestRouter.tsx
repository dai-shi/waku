'use client';

import { Link, useRouter } from 'waku';

export default function TestRouter() {
  const router = useRouter();
  const params = new URLSearchParams(router.query);
  const queryCount = parseInt(params.get('count') || '0');
  const hashCount = parseInt(router.hash?.slice(1) || '0');
  return (
    <>
      <p data-testid="path">Path: {router.path}</p>
      <p data-testid="query">Query: {queryCount}</p>
      <p data-testid="hash">Hash: {hashCount}</p>
      <p>
        <Link to={`?count=${queryCount + 1}`}>Increment query</Link>
      </p>
      <p>
        <button onClick={() => router.push(`?count=${queryCount + 1}`)}>
          Increment query (push)
        </button>
      </p>
      <p>
        <Link to={`#${hashCount + 1}`}>Increment hash</Link>
      </p>
      <p>
        <button onClick={() => router.push(`#${hashCount + 1}`)}>
          Increment hash (push)
        </button>
      </p>
    </>
  );
}
