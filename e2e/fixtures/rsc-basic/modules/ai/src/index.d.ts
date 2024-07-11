import type { ReactNode } from 'react';

declare function createAI(
  actions: Record<string, (...args: any[]) => any>,
): (props: { children: ReactNode }) => ReactNode;

declare function useActions(): Record<string, any>;
