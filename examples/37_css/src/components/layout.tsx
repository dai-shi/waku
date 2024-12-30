import { Suspense } from 'react';
import type { ReactNode } from 'react';

import './layout.styles.css';

// eslint-disable-next-line import/no-unresolved
import '@stylex-dev.css';

const Layout = ({ children }: { children: ReactNode }) => {
  return (
    <html>
      <head></head>
      <body>
        <div>
          {children}
          <Suspense fallback="Pending...">
            <ServerMessage />
          </Suspense>
        </div>
      </body>
    </html>
  );
};

const ServerMessage = async () => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return <p>Hello from server!</p>;
};

export default Layout;
