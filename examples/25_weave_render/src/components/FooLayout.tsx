import type { ReactNode } from 'react';

const FooLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html>
      <body>
        <div>
          <h1>FOO layout</h1>
          {children}
        </div>
      </body>
    </html>
  );
};

export default FooLayout;
