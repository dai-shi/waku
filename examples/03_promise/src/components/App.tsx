import { Suspense } from "react";
import type { ReactNode } from "react";
import { ClientOnly } from "waku/server";

import { Counter } from "./Counter.js";

const App = ({
  name,
  ssr,
  children,
}:
  | { name: string; ssr?: undefined; children: ReactNode }
  | { name: string; ssr: true; children?: undefined }) => {
  const delayedMessage = new Promise<string>((resolve) => {
    setTimeout(() => resolve("Hello from server!"), 2000);
  });
  return (
    <div style={{ border: "3px red dashed", margin: "1em", padding: "1em" }}>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      {ssr ? (
        <Suspense fallback={<div className="spinner" />}>
          <ClientOnly />
        </Suspense>
      ) : (
        <>
          <Counter delayedMessage={delayedMessage} />
          {children}
        </>
      )}
    </div>
  );
};

export default App;
