import { Link } from 'waku';
import { Suspense } from 'react';
import { Counter } from '../components/counter';
import { getHonoContext } from '../lib/hono';
import { getEnv, isBuild } from '../lib/waku';

export default async function HomePage() {
  const data = await getData();

  // Example: getting the Hono context object and invoking
  // waitUntil() on the Cloudflare executionCtx.
  // https://hono.dev/docs/api/context#executionctx
  const c = getHonoContext();
  c?.executionCtx?.waitUntil(
    new Promise<void>((resolve) => {
      setTimeout(() => {
        console.log(
          'Cloudflare waitUntil() promise resolved. The server response does not wait for this.',
        );
        resolve();
      }, 1000);
    }),
  );

  const maxItemsEnv = getEnv('MAX_ITEMS');
  const maxItems = maxItemsEnv ? Number.parseInt(maxItemsEnv) : undefined;

  return (
    <div>
      <title>{data.title}</title>
      <h1 className="text-4xl font-bold tracking-tight">{data.headline}</h1>
      <p>{data.body}</p>
      <p>MAX_ITEMS = {maxItems}.</p>
      <Suspense fallback="Pending...">
        <ServerMessage />
      </Suspense>
      <Counter max={maxItems} />
      <Link to="/about" className="mt-4 inline-block underline">
        About page
      </Link>
    </div>
  );
}

// Example async server component
const ServerMessage = async () => {
  if (isBuild()) {
    console.warn('Note: server components are awaited during build.');
    return null;
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return <p>Hello from server!</p>;
};

// Example async data fetching
const getData = async () => {
  const data = {
    title: 'Waku',
    headline: 'Waku',
    body: 'Hello world!',
  };

  return data;
};

// Enable dynamic server rendering.
// Static rendering is possible if you want to render at build time.
// The Hono context will not be available.
export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
