import type { ReactNode } from "react";

import { Link } from "waku/router/client";

const HomeLayout = ({ children }: { children: ReactNode }) => (
  <div>
    <ul>
      <li>
        <Link href="/">Home</Link>
      </li>
      <li>
        <Link href="/foo">Foo</Link>
      </li>
      <li>
        <Link href="/bar">Bar</Link>
      </li>
      <li>
        <Link href="/baz">Baz</Link>
      </li>
    </ul>
    {children}
  </div>
);

export default HomeLayout;
