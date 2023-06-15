import type { ReactNode } from "react";

import { isSsr } from "waku/server";

import { Counter } from "../src/Counter.js";
import { CounterSkeleton } from "../src/CounterSkeleton.js";

const Bar = ({ children }: { children: ReactNode }) => (
  <div>
    <h2>Bar</h2>
    {isSsr() ? <CounterSkeleton /> : <Counter />}
    {children}
  </div>
);

export default Bar;
