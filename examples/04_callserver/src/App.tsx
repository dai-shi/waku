import { Counter } from "./Counter.js";
import { greet } from "./funcs.js";

const App = ({ name = "Anonymous" }) => {
  return (
    <div style={{ border: "3px red dashed", margin: "1em", padding: "1em" }}>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      <Counter greet={greet} />
    </div>
  );
};

export default App;
