import type { ReactNode } from 'react';
import { Link } from 'waku/router/client';
import { Pending } from '../components/pending';

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
        <Link to="/bar1">
          Bar1
          <Pending />
        </Link>
      </li>
      <li>
        <Link to="/bar2">
          Bar2
          <Pending />
        </Link>
      </li>
      <li>
        <Link to="/baz1">
          Baz1
          <Pending />
        </Link>
      </li>
      <li>
        <Link to="/baz2">
          Baz2
          <Pending />
        </Link>
      </li>
    </ul>
    {children}
  </div>
);

export default HomeLayout;
