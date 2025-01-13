import { useState } from 'react';
import type { ReactNode } from 'react';

import { greet } from '../functions/greet';

export const Counter = () => {
  const [count, setCount] = useState(0);
  const [mesg, setMesg] = useState<ReactNode>(null);
  return (
    <div style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <h3>This is also a client component.</h3>
      <button onClick={async () => setMesg(await greet())}>Greet</button>
      {mesg}
    </div>
  );
};
