import type { ReactNode } from 'react';

export default function DynamicLayout({
  children,
  path,
}: {
  children: ReactNode;
  path: string;
}) {
  return (
    <>
      <nav>Current path: {path}</nav>
      {children}
    </>
  );
}
