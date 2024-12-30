import { Suspense } from 'react';

import { Counter } from './Counter';

const InnerApp = ({ count }: { count: number }) => {
  return (
    <div style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}>
      <h3>This is another server component.</h3>
      <p>The outer count is {count}.</p>
      <Counter />
      <Suspense fallback="Pending...">
        <ServerMessage />
      </Suspense>
    </div>
  );
};

const ServerMessage = async () => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return <p>Hello from server!</p>;
};

export default InnerApp;
