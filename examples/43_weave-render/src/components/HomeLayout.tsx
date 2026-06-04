import type { ReactNode } from 'react';
import { Link } from 'waku/router/client';
import { Pending } from './pending';

import '../styles.css';

const getCurrentTime = () => new Date();

const HomeLayout = ({ children }: { children: ReactNode }) => {
  const currentTime = getCurrentTime();
  return (
    <>
      <title>Waku</title>

      <div>
        <h1>Home layout</h1>
        <p>Last render time: {currentTime.toISOString()}</p>
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
            <Link to="/bar">
              Bar
              <Pending />
            </Link>
          </li>
        </ul>
        {children}
      </div>
    </>
  );
};

export default HomeLayout;
