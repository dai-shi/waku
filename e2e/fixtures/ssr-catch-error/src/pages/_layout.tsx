import type { ReactNode } from 'react';
import { ClientLayout } from '../components/client-layout.js';

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <ClientLayout>{children}</ClientLayout>;
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
