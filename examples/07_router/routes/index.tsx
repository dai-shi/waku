import type { ReactNode } from "react";

import { Link } from "wakuwork/router/server";

export default ({ children }: { children: ReactNode }) => {
  return (
    <div>
      <h1>Home</h1>
      <ul>
        <li>
          <Link href="/" pending=" Pending...">
            Home
          </Link>
        </li>
        <li>
          <Link href="/foo" pending=" Pending...">
            Foo
          </Link>
        </li>
        <li>
          <Link href="/bar" unstable_prefetchOnEnter>Bar</Link>
        </li>
        <li>
          <Link href="/nested/baz">Baz</Link>
        </li>
      </ul>
      {children}
    </div>
  );
};
