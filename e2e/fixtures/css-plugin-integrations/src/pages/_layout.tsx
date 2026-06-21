import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html>
      <head>
        <title>Waku CSS plugins</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
