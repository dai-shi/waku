import { Counter } from "./Counter.js";

import { serverHoc, useAtomValue } from "../lib/jotai-rsc/server.js";

import { doubleCountAtom } from "./derivedAtoms.js";

const App = serverHoc(({ name = "Anonymous" }) => {
  const value = useAtomValue(doubleCountAtom);
  return (
    <div style={{ border: "3px red dashed", margin: "1em", padding: "1em" }}>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      double count value: {value}
      <Counter />
    </div>
  );
});

export default App;
