'use client';

import { useState, useTransition } from 'react';
import { unstable_allowServer as allowServer } from 'waku/client';
import { useRefetch_UNSTABLE as useRefetch } from 'waku/minimal/client';
import { ClientBox } from './Box.js';

export const ClientCounter = ({ params }: { params: unknown }) => {
  const [count, setCount] = useState(0);
  const refetch = useRefetch();
  const [isPending, startTransition] = useTransition();
  return (
    <ClientBox data-testid="client-counter">
      <p data-testid="count">{count}</p>
      <button data-testid="increment" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
      <button data-testid="refetch1" onClick={() => refetch('foo')}>
        Refetch1
      </button>
      <button data-testid="refetch2" onClick={() => refetch('[bar]')}>
        Refetch2
      </button>
      <button data-testid="refetch3" onClick={() => refetch('baz/qux')}>
        Refetch3
      </button>
      <button
        data-testid="refetch4"
        onClick={() => refetch('params', { foo: 'bar' })}
      >
        Refetch with params
      </button>
      <div data-testid="refetch-params">{JSON.stringify(params)}</div>
      <button
        data-testid="refetch5"
        onClick={() =>
          startTransition(async () => {
            await refetch('with-transition');
          })
        }
      >
        Refetch with transition
      </button>
      <div data-testid="refetch-transition">
        {isPending ? 'pending' : 'idle'}
      </div>
    </ClientBox>
  );
};

export const someConfigs = allowServer({
  foo: 'value-1234',
});
