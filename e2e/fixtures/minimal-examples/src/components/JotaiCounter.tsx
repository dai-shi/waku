'use client';

import { useTransition } from 'react';
import { atom, useAtom } from 'jotai';
import { unstable_allowServer as allowServer } from 'waku/client';

export const countAtom = allowServer(atom(1));

export function JotaiCounter() {
  const [count, setCount] = useAtom(countAtom);
  const [isPending, startTransition] = useTransition();
  return (
    <div>
      <p data-testid="jotai-count">Jotai count: {count}</p>
      <button
        onClick={() =>
          startTransition(() => {
            setCount((c) => c + 1);
          })
        }
      >
        Increment jotai
      </button>
      <span data-testid="jotai-pending">{isPending ? 'pending' : 'idle'}</span>
    </div>
  );
}
