import type { Atom } from 'jotai/vanilla';

import { Counter, countAtom } from './counter';
import { SyncAtoms } from './syncatoms';

type Store = {
  get: <Value>(atom: Atom<Value>) => Value;
};

const App = ({ name, store }: { name: string; store: Store }) => {
  const count = store.get(countAtom);
  return (
    <html>
      <head>
        <title>Waku</title>
      </head>
      <body>
        <div
          style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}
        >
          <h1>
            Hello {name}!! (count={count})
          </h1>
          <h3>This is a server component.</h3>
          <Counter />
          <div>{new Date().toISOString()}</div>
        </div>
        <SyncAtoms />
      </body>
    </html>
  );
};

export default App;
