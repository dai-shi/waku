import { Counter } from "./Counter.js";
import { getCounter, increment } from "./funcs.js";

const App = ({ name = "Anonymous" }) => {
  return (
    <div style={{ border: "3px red dashed", margin: "1em", padding: "1em" }}>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      <p>Server counter: {getCounter()}</p>
      <Counter increment={increment} />
    </div>
  );
};

export default App;
