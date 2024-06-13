import type { ReactNode } from 'react';

declare function createAI(
  actions: Record<string, any>,
): (props: { children: ReactNode }) => ReactNode;

declare function useActions(): Record<string, any>;
