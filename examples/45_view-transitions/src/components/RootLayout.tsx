import type { ReactNode } from 'react';
import { Link } from './Link';
import '../styles.css';

const RootLayout = ({ children }: { children: ReactNode }) => (
  <div>
    <title>Waku</title>
    <nav style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0' }}>
      <ul style={{ display: 'flex', gap: '1rem' }}>
        <li>
          <Link to="/">Home</Link>
        </li>
        <li>
          <Link to="/about">About</Link>
        </li>
      </ul>
    </nav>
    {children}
  </div>
);

export default RootLayout;
