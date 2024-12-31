'use client';

import { useState } from 'react';

export type CounterProps = {
  throws: () => Promise<string>;
};

export function Counter({ throws }: CounterProps) {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  return (
    <div>
      <p data-testid="throws-error">{error}</p>
      <p data-testid="throws-success">{success}</p>
      <button
        data-testid="throws"
        onClick={() => {
          throws()
            .then((value) => {
              setSuccess(value);
            })
            .catch(setError);
        }}
      >
        throw
      </button>
    </div>
  );
}
