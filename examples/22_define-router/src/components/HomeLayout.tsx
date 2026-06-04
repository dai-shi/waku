import type { ReactNode } from 'react';
import { Link } from 'waku/router/client';
import { Pending } from './pending';

import '../styles.css';

const HomeLayout = ({ children }: { children: ReactNode }) => (
  <div>
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
        <Link to="/nested/baz">Nested / Baz</Link>
      </li>
      <li>
        <Link to="/dynamic/foo">Dynamic / foo</Link>
      </li>
      <li>
        <Link to="/dynamic/bar">Dynamic / bar</Link>
      </li>
      <li>
        <Link to="/dynamic/[aaa]">Dynamic / [aaa]</Link>
      </li>
    </ul>
    {children}
  </div>
);

export default HomeLayout;
