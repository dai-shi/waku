import type { ReactNode } from 'react';
import { Link } from 'waku/router/client';
import { Pending } from './pending';
import '../styles.css';
import { RoutingHandler } from './RoutingHandler';

const HomeLayout = ({ children }: { children: ReactNode }) => (
  <div>
    <RoutingHandler />
    <ul>
      <li>
        <Link to="/">
          Home
          <Pending />
        </Link>
      </li>
      <li>
        <Link to="/foo">
          Foo
          <Pending />
        </Link>
      </li>
      <li>
        <Link to="/bar" unstable_prefetchOnEnter>
          Bar
        </Link>
      </li>
      <li>
        <Link to="/baz">Baz</Link>
      </li>
      <li>
        <Link to="/nested/foo">Nested / Foo</Link>
      </li>
      <li>
        <Link to="/nested/bar">Nested / Bar</Link>
      </li>
      <li>
        <Link to="/nested/baz">Nested / Baz</Link>
      </li>
      <li>
        <Link to="/nested/qux">Nested / Qux</Link>
      </li>
      <li>
        <Link to="/slice-page">Slice Page</Link>
      </li>
    </ul>
    {children}
  </div>
);

export default HomeLayout;
