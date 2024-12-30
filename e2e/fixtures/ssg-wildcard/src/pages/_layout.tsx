import type { ReactNode } from 'react';

const Layout = ({ children }: { children: ReactNode }) => (
  <div>
    <title>Waku</title>
    {children}
  </div>
);

export default Layout;
