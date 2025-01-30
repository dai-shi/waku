import type { Atom } from 'jotai/vanilla';

import { Counter, countAtom } from './counter';
import { SyncAtoms } from './syncatoms';

// TODO this is more or less a hack for now
export const atoms: Atom<unknown>[] = [];

const App = ({ name, atomValues }: { name: string; atomValues: unknown[] }) => {
  if (!atoms.includes(countAtom)) {
    atoms.push(countAtom);
  }
  const count = atomValues[0] as number | undefined;
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
            Hello {name}!! (count={count ?? countAtom.init})
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
