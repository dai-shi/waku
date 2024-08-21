import type { ReactNode } from 'react';

const Layout = ({ children }: { children: ReactNode }) => (
  <html>
    <head>
      <title>Waku</title>
    </head>
    <body>
      <div>{children}</div>
    </body>
  </html>
);

export default Layout;
