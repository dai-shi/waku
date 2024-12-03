import type { ReactNode } from 'react';

import { Link } from 'waku/router/client';

import '../styles.css';

const Pending = ({ isPending }: { isPending: boolean }) => (
  <span
    style={{
      marginLeft: 5,
      transition: 'opacity 75ms 100ms',
      opacity: isPending ? 1 : 0,
    }}
  >
    Pending...
  </span>
);

const HomeLayout = ({ children }: { children: ReactNode }) => (
  <div>
    <ul>
      <li>
        <Link
          to="/"
          pending={<Pending isPending />}
          notPending={<Pending isPending={false} />}
        >
          Home
        </Link>
      </li>
      <li>
        <Link
          to="/foo"
          pending={<Pending isPending />}
          notPending={<Pending isPending={false} />}
        >
          Foo
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
    </ul>
    {children}
  </div>
);

export default HomeLayout;
