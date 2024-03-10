import React, { cache } from 'react';
import { getContext } from 'waku/server';

import { Counter } from './Counter.js';

const fn = cache(() => Date.now());

const AsyncComponent = async () => {
  const now1 = fn();
  const c1 = (React as any).__SECRET_SERVER_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentCache.current;
  const cc1 = c1.getCacheForType(Date.now);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const c2 = (React as any).__SECRET_SERVER_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentCache.current;
  const cc2 = c2.getCacheForType(Date.now);
  console.log(cc1 === cc2);
  const now2 = fn();
  console.log({ now1, now2 });
  return (
    <ul>
      <li>{now1}</li>
      <li>{now2}</li>
    </ul>
  );
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
      <AsyncComponent />
    </div>
  );
};

export default App;
