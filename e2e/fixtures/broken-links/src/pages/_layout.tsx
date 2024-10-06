import type { ReactNode } from 'react';

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
