'use client';

import { useState, useTransition } from 'react';

import { TextBox } from './TextBox';

const Counter = ({
  greet,
  increment,
}: {
  greet: (name: string) => Promise<string>;
  increment: () => void;
}) => {
  const [isPending, startTransition] = useTransition();
  const [count, setCount] = useState(0);
  const [text, setText] = useState<string | Promise<string>>('');
  const handleClick1 = () => {
    startTransition(() => {
      setText(greet('c=' + count));
    });
  };
  const handleClick2 = () => {
    startTransition(() => {
      increment();
    });
  };
  return (
    <div style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}>
      {isPending ? 'Pending...' : ''}
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <button onClick={handleClick1}>{text || 'Click to greet'}</button>
      <button onClick={handleClick2}>Increment server counter</button>{' '}
      <h3>This is a client component.</h3>
      <TextBox />
    </div>
  );
};

export default Counter;
