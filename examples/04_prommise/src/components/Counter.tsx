/// <reference types="react/canary" />
'use client';

import { Suspense, useState, use } from 'react';

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
}) => {
  return (
    <ul>
      <li>count: {count}</li>
      {/* We want show the usage without `use` but it causes a hydration error. https://github.com/dai-shi/waku/issues/202 */}
      <li>delayedMessage: {use(delayedMessage)}</li>
    </ul>
  );
};
