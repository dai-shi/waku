'use client';

import { ViewTransition } from 'react';
import type { ReactNode } from 'react';

// React animates an update wrapped in <ViewTransition> only when the router
// commits it inside a transition, so onEnter firing proves Waku's navigation
// still goes through startTransition.
export function ViewTransitionProbe({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      onEnter={() => {
        (window as unknown as Record<string, unknown>).__viewTransitionEntered =
          true;
      }}
    >
      {children}
    </ViewTransition>
  );
}
