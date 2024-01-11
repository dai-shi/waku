import type { ReactNode } from 'react';

import { Link } from 'waku/router/client';

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
    <title>Waku example</title>
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
    </ul>
    {children}
  </div>
);

export default HomeLayout;
