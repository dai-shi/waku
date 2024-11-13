import type { ReactNode } from 'react';

const FooLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div>
      <h1>FOO layout</h1>
      {children}
    </div>
  );
};

export default FooLayout;
