import type { ReactNode } from "react";

import { Link } from "waku/router/server";

const HomeLayout = ({ children }: { children: ReactNode }) => (
  <div>
    {children}
    <ul>
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
  </div>
);

export default HomeLayout;
