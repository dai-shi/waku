import { Suspense } from "react";

import { Counter } from "./Counter.js";

const App = ({ name = "Anonymous" }) => {
  return (
    <div style={{ border: "3px red dashed", margin: "1em", padding: "1em" }}>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      <Suspense fallback="Pending...">
        <ServerMessage />
      </Suspense>
      <Suspense fallback={<CounterSkeleton />}>
        <Counter />
      </Suspense>
    </div>
  );
};

const ServerMessage = async () => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return <p>Hello from server!</p>;
};

const CounterSkeleton = () => {
  return (
    <div style={{ border: "3px blue dashed", margin: "1em", padding: "1em" }}>
      <p>Count: {0}</p>
      <button disabled>Increment</button>
      <h3>This is a skeleton component.</h3>
    </div>
  );
};

export default App;
