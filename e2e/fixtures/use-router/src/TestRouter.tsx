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
      <p>
        <button
          data-testid="router-replace-dynamic"
          onClick={() => router.replace('/dynamic?count=9#9')}
        >
          Dynamic router.replace button
        </button>
      </p>
      <p>
        <button
          data-testid="router-replace-static"
          onClick={() => router.replace('/static?count=8#8')}
        >
          Static router.replace button
        </button>
      </p>
      <p>
        <button data-testid="router-back" onClick={() => router.back()}>
          router.back button
        </button>
      </p>
      <p>
        <button data-testid="router-forward" onClick={() => router.forward()}>
          router.forward button
        </button>
      </p>
      <p>
        <button data-testid="router-reload" onClick={() => router.reload()}>
          router.reload button
        </button>
      </p>
      <p>
        <button
          data-testid="router-prefetch-static"
          onClick={() => router.prefetch('/static?count=55#55')}
        >
          router.prefetch static target
        </button>
      </p>
      <p>
        <button
          data-testid="router-push-prefetched-static"
          onClick={() => router.push('/static?count=55#55')}
        >
          router.push prefetched static target
        </button>
      </p>
      <p>
        <button
          data-testid="router-prefetch-structured"
          onClick={() => router.prefetch({ to: '/static', hash: '#77' })}
        >
          router.prefetch structured target
        </button>
      </p>
      <p>
        <button
          data-testid="router-push-structured"
          onClick={() => router.push({ to: '/static', hash: '#77' })}
        >
          router.push structured target
        </button>
      </p>
      <p>
        <button
          data-testid="router-push-static-trailing"
          onClick={() => router.push('/static/')}
        >
          router.push static trailing target
        </button>
      </p>
      <p>
        <Link to="/static/" data-testid="link-static-trailing">
          Go to static trailing
        </Link>
      </p>
    </>
  );
}
