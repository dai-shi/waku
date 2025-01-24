'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

const FormStatus = () => {
  const { pending } = useFormStatus();
  return pending ? 'Pending...' : null;
};

export const Counter = ({
  increment,
}: {
  increment: (count: number) => Promise<number>;
}) => {
  const [count, dispatch] = useActionState(increment, 0);
  return (
    <div style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}>
      <form>
        <p>Count: {count}</p>
        <button formAction={dispatch}>Increment</button>
        <FormStatus />
      </form>
      <h3>This is a client component.</h3>
    </div>
  );
};
