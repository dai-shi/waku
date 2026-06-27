import type { ReactNode } from 'react';
import { Link } from 'waku';

const Layout = ({ children }: { children: ReactNode }) => (
  <div>
    <title>Waku</title>
    <Link to="/about">About</Link>
    {children}
  </div>
);

export default Layout;
