import type { ReactNode } from 'react';
import { ClientLayout } from '../components/client-layout.js';

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html>
      <head></head>
      <body>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
