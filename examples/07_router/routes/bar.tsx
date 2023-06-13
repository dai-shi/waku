import { Suspense } from "react";
import type { ReactNode } from "react";

import { Counter } from "../src/Counter.js";
import { CounterSkeleton } from "../src/CounterSkeleton.js";

const Bar = ({ children }: { children: ReactNode }) => (
  <div>
    <h2>Bar</h2>
    <Suspense fallback={<CounterSkeleton />}>
      <Counter />
    </Suspense>
    {children}
  </div>
);

export default Bar;
