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
          href="/"
          pending={<Pending isPending />}
          notPending={<Pending isPending={false} />}
        >
          Home
        </Link>
      </li>
      <li>
        <Link
          href="/foo"
          pending={<Pending isPending />}
          notPending={<Pending isPending={false} />}
        >
          Foo
        </Link>
      </li>
    </ul>
    {children}
  </div>
);

export default HomeLayout;
