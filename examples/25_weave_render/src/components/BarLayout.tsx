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

const BarLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html>
      <head>
        <title>Waku</title>
      </head>
      <body>
        <div>
          <p>This Layout is expected to be static</p>
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
              <Link
                to="/nested/bar"
                pending={<Pending isPending />}
                notPending={<Pending isPending={false} />}
              >
                Nested / Bar
              </Link>
            </li>
          </ul>
          {children}
        </div>
      </body>
    </html>
  );
};

export default BarLayout;
