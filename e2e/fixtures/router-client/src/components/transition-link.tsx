'use client';

import type { ComponentProps } from 'react';
import { Link } from 'waku/router/client';

const startTransition: ComponentProps<
  typeof Link
>['unstable_startTransition'] = (callback) => {
  (window as unknown as Record<string, unknown>).__transitionStarted = true;
  void callback();
};

export function TransitionLink() {
  return (
    <Link
      to="/view-target?from=transition"
      unstable_startTransition={startTransition}
      data-testid="transition-link"
    >
      Go with transition
    </Link>
  );
}
