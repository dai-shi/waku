import type { ReactNode } from 'react';

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html>
      <head></head>
      <body>{children}</body>
    </html>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
