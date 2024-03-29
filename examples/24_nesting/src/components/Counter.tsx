'use client';

import { useState, useTransition } from 'react';
import { Slot, useRefetch } from 'waku/client';

export const Counter = ({ enableInnerApp }: { enableInnerApp?: boolean }) => {
  const [count, setCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const refetch = useRefetch();
  const handleClick = () => {
    if (enableInnerApp) {
      startTransition(() => {
        const nextCount = count + 1;
        setCount(nextCount);
        if (enableInnerApp) {
          refetch('InnerApp=' + nextCount);
        }
      });
    } else {
      setCount((c) => c + 1);
    }
  };
  return (
    <div style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}>
      <p>Count: {count}</p>
      <button onClick={handleClick} disabled={isPending}>
        Increment
      </button>{' '}
      {isPending && 'Pending...'}
      <h3>This is a client component.</h3>
      {enableInnerApp && <Slot id="InnerApp" />}
    </div>
  );
};
