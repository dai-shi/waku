'use client';

import { useCallback, useState } from 'react';

export type CounterProps = {
  ping: () => Promise<string>;
  increase: (value: number) => Promise<number>;
};

export function Counter({ increase, ping }: CounterProps) {
  const [pong, setPong] = useState<string | null>(null);
  const [counter, setCounter] = useState(0);
  return (
    <div>
      <p data-testid="pong">{pong}</p>
      <button
        data-testid="ping"
        onClick={() => {
          ping()
            .then((value) => {
              setPong(value);
            })
            .catch(console.error);
        }}
      >
        ping
      </button>
      <p data-testid="counter">{counter}</p>
      <button
        data-testid="increase"
        onClick={useCallback(() => {
          increase(counter)
            .then((value) => setCounter(value))
            .catch(console.error);
        }, [counter, increase])}
      >
        Increase
      </button>
    </div>
  );
}
