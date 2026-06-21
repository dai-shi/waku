import type { ReactNode } from 'react';

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <head>
        <title>Waku TanStack Router</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
