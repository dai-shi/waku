import type { ReactNode } from 'react';

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <head></head>
      <body
        data-dynamic-root={`Random Number ${Math.round(Math.random() * 100)}`}
      >
        {children}
      </body>
    </html>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  };
};
