import { Counter } from "./Counter.js";

import { serverHoc, readAtomValue } from "../lib/jotai-rsc/server.js";

import { countAtom } from "./baseAtoms.js";

const App = serverHoc(({ name = "Anonymous" }) => {
  const value = readAtomValue(countAtom);
  return (
    <div style={{ border: "3px red dashed", margin: "1em", padding: "1em" }}>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      countAtom value: {value}
      <Counter />
    </div>
  );
});

export default App;
