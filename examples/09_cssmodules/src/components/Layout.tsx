import { Suspense } from 'react';
import type { ReactNode } from 'react';

import './styles.css';

const Layout = ({ children }: { children: ReactNode }) => {
  return (
    <div>
      {children}
      <Suspense fallback="Pending...">
        <ServerMessage />
      </Suspense>
    </div>
  );
};

const ServerMessage = async () => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return <p>Hello from server!</p>;
};

export default Layout;
