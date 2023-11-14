import type { ReactNode } from 'react';

import { Counter } from '../../components/Counter.js';

const Nested = ({ children }: { children: ReactNode }) => (
  <div>
    <h2>Nested</h2>
    <Counter />
    {children}
  </div>
);

export default Nested;
