import { Suspense, cache } from 'react';
import { getContextData } from 'waku/middleware/context';
import { getHonoContext } from 'waku/unstable_hono';

import { Counter } from './Counter';

const cachedFn = cache(() => Date.now());

const InternalAsyncComponent = async () => {
  const val1 = cachedFn();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const val2 = cachedFn();
  if (val1 !== val2) {
    throw new Error('Cache not working');
  }
  console.log('waku context', Object.keys(getContextData()));
  console.log('hono context', getHonoContext());
  return null;
};

const App = ({ name, items }: { name: string; items: unknown[] }) => {
  const data = getContextData() as { count?: number };
  return (
    <html>
      <head>
        <title>Waku</title>
      </head>
      <body>
        <div
          style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}
        >
          <h1>Hello {name}!!</h1>
          <h3>This is a server component.</h3>
          <p>Cookie count: {data.count || 0}</p>
          <Counter />
          <p>Item count: {items.length}</p>
          <Suspense>
            <InternalAsyncComponent />
          </Suspense>
        </div>
      </body>
    </html>
  );
};

export default App;
