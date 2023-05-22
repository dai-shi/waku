import type { ReactNode } from "react";

import { Link } from "waku/router/server";

const Pending = ({ isPending }: { isPending: boolean }) => (
  <span
    style={{
      marginLeft: 5,
      transition: "opacity 75ms 100ms",
      opacity: isPending ? 1 : 0,
    }}
  >
    Pending...
  </span>
);

export default ({ children }: { children: ReactNode }) => {
  return (
    <div>
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
        <li>
          <Link href="/bar" unstable_prefetchOnEnter>
            Bar
          </Link>
        </li>
        <li>
          <Link href="/nested/baz">Nested / Baz</Link>
        </li>
        <li>
          <Link href="/nested/qux">Nested / Qux</Link>
        </li>
      </ul>
      <h1>Home</h1>
      {children}
    </div>
  );
};
