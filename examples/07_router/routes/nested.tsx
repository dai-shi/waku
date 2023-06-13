import { Suspense } from "react";
import type { ReactNode } from "react";

import { Counter } from "../src/Counter.js";
import { CounterSkeleton } from "../src/CounterSkeleton.js";

const Nested = ({ children }: { children: ReactNode }) => (
  <div>
    <h2>Nested</h2>
    <Suspense fallback={<CounterSkeleton />}>
      <Counter />
    </Suspense>
    {children}
  </div>
);

export default Nested;
