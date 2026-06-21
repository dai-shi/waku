import type { ReactNode } from 'react';

export async function DynamicIsland({ children }: { children: ReactNode }) {
  await new Promise((resolve) => setTimeout(resolve, 10));
  return (
    <section data-testid="island">
      <p>Dynamic island loaded</p>
      {children}
    </section>
  );
}
