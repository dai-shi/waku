'use client';

import { useState } from 'react';

export type CounterProps = {
  throws: (input: string) => Promise<string>;
};

export function Counter({ throws }: CounterProps) {
  const [error, setError] = useState('init');
  const [success, setSuccess] = useState('init');
  return (
    <div>
      <p data-testid="throws-error">{error}</p>
      <p data-testid="throws-success">{success}</p>
      <button
        data-testid="throws"
        onClick={() => {
          throws('')
            .then((value) => {
              setSuccess(value);
            })
            .catch((e) => setError(e.message));
        }}
      >
        throw
      </button>
      <button
        data-testid="success"
        onClick={() => {
          throws('It worked')
            .then((value) => {
              setSuccess(value);
            })
            .catch((e) => {
              console.error(e);
              setError(e.message);
            });
        }}
      >
        success
      </button>
      <button
        data-testid="reset"
        onClick={() => {
          setSuccess('init');
          setError('init');
        }}
      >
        reset
      </button>
    </div>
  );
}
