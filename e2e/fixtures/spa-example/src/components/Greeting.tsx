import { useState } from 'react';
import { greet } from '../functions/greet';

export const Greeting = () => {
  const [greeting, setGreeting] = useState('');
  return (
    <>
      <p data-testid="greeting">{greeting}</p>
      <button onClick={async () => setGreeting(await greet('Waku'))}>
        Greet
      </button>
    </>
  );
};
