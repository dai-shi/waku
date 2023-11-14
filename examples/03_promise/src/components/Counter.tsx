'use client';

import { Suspense, useState } from 'react';

export const Counter = ({
  delayedMessage,
}: {
  delayedMessage: Promise<string>;
}) => {
  const [count, setCount] = useState(0);
  return (
    <div style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <h3>This is a client component.</h3>
      <Suspense fallback="Pending...">
        <Message count={count} delayedMessage={delayedMessage} />
      </Suspense>
    </div>
  );
};

const Message = ({
  count,
  delayedMessage,
}: {
  count: number;
  delayedMessage: Promise<string>;
}) => (
  <ul>
    <li>count: {count}</li>
    <li>delayedMessage: {delayedMessage as any}</li>
  </ul>
);
