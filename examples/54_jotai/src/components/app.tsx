import type { Atom } from 'jotai/vanilla';

import { Counter, countAtom } from './counter';

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
            {/* TODO how can we get the initial value of atom? */}
            Hello {name}!! (count={count ?? 0})
          </h1>
          <h3>This is a server component.</h3>
          <Counter />
          <div>{new Date().toISOString()}</div>
        </div>
      </body>
    </html>
  );
};

export default App;
