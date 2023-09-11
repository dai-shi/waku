import type { ReactNode } from "react";
import { Counter } from "./Counter.js";

const App = ({ name, children }: { name: string; children: ReactNode }) => {
  const delayedMessage = new Promise<string>((resolve) => {
    setTimeout(() => resolve("Hello from server!"), 2000);
  });
  return (
    <div style={{ border: "3px red dashed", margin: "1em", padding: "1em" }}>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      <Counter delayedMessage={delayedMessage} />
      {children}
    </div>
  );
};

export default App;
