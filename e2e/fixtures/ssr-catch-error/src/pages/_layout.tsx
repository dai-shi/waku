import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { getContextData } from 'waku/middleware/context';

import { ClientLayout } from '../components/client-layout.js';

const CheckIfAccessDenied = ({ children }: { children: ReactNode }) => {
  const data = getContextData();
  if (data.unauthorized) {
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
      <Suspense fallback="Loading...">
        <CheckIfAccessDenied>{children}</CheckIfAccessDenied>
      </Suspense>
    </ClientLayout>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
