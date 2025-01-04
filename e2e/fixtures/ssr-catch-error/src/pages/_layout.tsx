import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { ClientLayout } from '../components/client-layout.js';

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ClientLayout>
      <Suspense fallback="Loading...">{children}</Suspense>
    </ClientLayout>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
