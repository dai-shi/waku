import type { ReactNode } from 'react';
import { ClientLayout } from '../components/client-layout.js';
import { authStorage } from '../middleware/validator.js';

const CheckIfAccessDenied = ({ children }: { children: ReactNode }) => {
  if (authStorage.getStore()?.unauthorized) {
    throw new Error('401 Unauthorized');
  }
  return children;
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ClientLayout>
      <CheckIfAccessDenied>{children}</CheckIfAccessDenied>
    </ClientLayout>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
