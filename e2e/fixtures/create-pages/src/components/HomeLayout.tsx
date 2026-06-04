import type { ReactNode } from 'react';
import { Link } from 'waku/router/client';
import { Pending } from './pending';

import '../styles.css';

let renderCount = 0;

const HomeLayout = ({ children }: { children: ReactNode }) => {
  ++renderCount;
  return (
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
          <Link to="/error">Error</Link>
        </li>
        <li>
          <Link to="/exact/[slug]/[...wild]">Exact Path</Link>
        </li>
        <li>
          <Link to="/nested-layouts">Nested Layouts</Link>
        </li>
        <li>
          <Link to="/slices">Slices</Link>
        </li>
      </ul>
      {children}
      <h4 data-testid="home-layout-render-count">
        Render Count: {renderCount}
      </h4>
    </div>
  );
};

export default HomeLayout;
