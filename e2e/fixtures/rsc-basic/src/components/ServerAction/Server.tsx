import type { ReactNode } from 'react';
import { createAI } from 'ai/rsc';

const AI = createAI({
  foo: async () => {
    'use server';
    return 0;
  },
});

export function ServerProvider({ children }: { children: ReactNode }) {
  return <AI>{children}</AI>;
}
