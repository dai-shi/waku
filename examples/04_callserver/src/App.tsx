import { register } from "wakuwork/register";

import { Counter } from "./Counter.tsx";
import { greet } from "./funcs.ts";

const App = ({ name = "Anonymous" }) => {
  return (
    <div style={{ border: "3px red dashed", margin: "1em", padding: "1em" }}>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      <Counter greet={greet} />
    </div>
  );
};

register('App', App);

export default App;
