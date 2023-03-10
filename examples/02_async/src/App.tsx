import { Suspense } from "react";
import { register } from "wakuwork/register";

import { Counter } from "./Counter.tsx";

const App = ({ name = "Anonymous" }) => {
  return (
    <div style={{ border: "3px red dashed", margin: "1em", padding: "1em" }}>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      <Suspense fallback="Pending...">
        <ServerMessage />
      </Suspense>
      <Counter />
    </div>
  );
};

const ServerMessage = (async () => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return <p>Hello from server!</p>;
}) as any; // FIXME how can we type async component?

register('App', App);

export default App;
