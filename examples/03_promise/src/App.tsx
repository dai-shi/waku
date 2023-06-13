import { Suspense } from "react";

import { Counter } from "./Counter.js";

const App = ({ name = "Anonymous" }) => {
  const delayedMessage = new Promise<string>((resolve) => {
    setTimeout(() => resolve("Hello from server!"), 2000);
  });
  return (
    <div style={{ border: "3px red dashed", margin: "1em", padding: "1em" }}>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      <Suspense fallback="Loading...">
        <Counter delayedMessage={delayedMessage} />
      </Suspense>
    </div>
  );
};

export default App;
