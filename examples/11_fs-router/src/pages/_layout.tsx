import type { ReactNode } from 'react';
import { Link } from 'waku/router/client';
import { Pending } from '../components/pending';

const HomeLayout = ({ children }: { children: ReactNode }) => (
  <div>
    <title>Waku</title>
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
          <Pending />
        </Link>
      </li>
      <li>
        <Link to="/nested/baz">
          Nested / Baz
          <Pending />
        </Link>
      </li>
      <li>
        <Link to="/nested/qux">
          Nested / Qux
          <Pending />
        </Link>
      </li>
      <li>
        <Link to="/slice-page">Slice Page</Link>
      </li>
      <li>
        <Link to="/debug">Debug</Link>
      </li>
    </ul>
    {children}
  </div>
);

export default HomeLayout;
