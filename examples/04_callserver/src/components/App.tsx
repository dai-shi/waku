import { Counter } from "./Counter.js";
import { greet } from "./funcs.js";

type ServerFunction<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => Promise<R>
  : never;

const App = ({ name }: { name: string }) => {
  return (
    <div style={{ border: "3px red dashed", margin: "1em", padding: "1em" }}>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      <Counter greet={greet as unknown as ServerFunction<typeof greet>} />
    </div>
  );
};

export default App;
