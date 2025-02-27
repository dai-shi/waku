import { Suspense } from 'react';
import type { ReactNode } from 'react';

export default async function AsyncLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <Suspense fallback="Loading...">{children}</Suspense>;
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
