import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html>
      <head>
        <title>Waku React Compiler</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
