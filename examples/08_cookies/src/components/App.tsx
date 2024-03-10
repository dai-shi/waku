import { Suspense, cache } from 'react';
import { getContext } from 'waku/server';

import { Counter } from './Counter.js';

const cachedFn = cache(() => Date.now());

const InternalAsyncComponent = async () => {
  const val1 = cachedFn();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const val2 = cachedFn();
  if (val1 !== val2) {
    throw new Error('Cache not working');
  }
  console.log(getContext());
  return null;
};

const App = ({ name, items }: { name: string; items: unknown[] }) => {
  const context = getContext<{ count: number }>();
  return (
    <div style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}>
      <title>Waku</title>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      <p>Cookie count: {context.count}</p>
      <Counter />
      <p>Item count: {items.length}</p>
      <Suspense>
        <InternalAsyncComponent />
      </Suspense>
    </div>
  );
};

export default App;
