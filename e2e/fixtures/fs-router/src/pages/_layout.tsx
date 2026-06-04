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
        <Link to="/nested/encoded%20path">
          Nested / Encoded Path
          <Pending />
        </Link>
      </li>
      <li>
        <Link to="/nested/encoded%E6%B8%AC%E8%A9%A6path">
          Nested / Encoded Unicode Path
          <Pending />
        </Link>
      </li>
      <li>
        <Link to="/static-nested/encoded%20path">
          Nested / Static Encoded Path
          <Pending />
        </Link>
      </li>
      <li>
        <Link to="/static-nested/encoded%E6%B8%AC%E8%A9%A6path">
          Nested / Static Encoded Unicode Path
          <Pending />
        </Link>
      </li>
      <li>
        <Link to="/page-with-slices">Page with Slices</Link>
      </li>
      <li>
        <Link to="/css-split">Css split</Link>
      </li>
      <li>
        <Link to="/page-with-segment/introducing-waku">
          Page with Segment / Introducing Waku
        </Link>
      </li>
      <li>
        <Link to="/page-with-segment/article/introducing-waku">
          Page with Segment / Article / Introducing Waku
        </Link>
      </li>
    </ul>
    {children}
  </div>
);

export default HomeLayout;
