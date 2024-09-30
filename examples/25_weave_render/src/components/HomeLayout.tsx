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

const getCurrentTime = () => new Date();

const HomeLayout = ({ children }: { children: ReactNode }) => {
  const currentTime = getCurrentTime();
  return (
    <html>
      <head>
        <title>Waku</title>
      </head>
      <body>
        <div>
          <p>Last render time: {currentTime.toISOString()}</p>
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
          </ul>
          {children}
        </div>
      </body>
    </html>
  );
};

export default HomeLayout;
