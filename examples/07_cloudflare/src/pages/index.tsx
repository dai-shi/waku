import { Link } from 'waku';
import { Suspense } from 'react';
import { Counter } from '../components/counter';
import { getHonoContext } from '../lib/hono';

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
          'waitUntil promise resolved... this is running after the response was sent',
        );
        resolve();
      }, 1000);
    }),
  );

  return (
    <div className="container">
      <title>{data.title}</title>
      <h1 className="text-4xl font-bold tracking-tight">{data.headline}</h1>
      <p>{data.body}</p>
      <p>
        MAX_ITEMS server environment variable, set in wrangler.toml ={' '}
        {c?.env.MAX_ITEMS}. Note that this is not available at build time. Use{' '}
        <a href="https://waku.gg/#environment-variables">getEnv</a> to access
        environment variables present at build time.
      </p>
      <Suspense fallback="Pending...">
        <ServerMessage />
      </Suspense>
      <Counter />
      <Link to="/about" className="mt-4 inline-block underline">
        About page
      </Link>
    </div>
  );
}

// Example async server component
const ServerMessage = async () => {
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
