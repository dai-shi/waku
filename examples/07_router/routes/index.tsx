import { ReactNode } from "react";

import { Link } from "wakuwork/router/server";

export default ({ children }: { children: ReactNode }) => {
  return (
    <div>
      <h1>Home</h1>
      <ul>
        <li><Link href="/">Home</Link></li>
        <li><Link href="/foo">Foo</Link></li>
        <li><Link href="/bar">Bar</Link></li>
        <li><Link href="/nested/baz">Baz</Link></li>
      </ul>
      {children}
    </div>
  );
};
