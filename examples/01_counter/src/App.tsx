import { Suspense } from "react";

import { Counter } from "./Counter.js";
import { CounterSkeleton } from "./CounterSkeleton.js";

const App = ({ name = "Anonymous" }) => {
  return (
    <div style={{ border: "3px red dashed", margin: "1em", padding: "1em" }}>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      <Suspense fallback={<CounterSkeleton />}>
        <Counter />
      </Suspense>
    </div>
  );
};

export default App;
