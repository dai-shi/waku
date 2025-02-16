'use client';

import type { ComponentProps } from 'react';
import { Link as OrigLink } from 'waku/router/client';

const startViewTransition =
  typeof document !== 'undefined'
    ? (fn: () => void) => {
        document.startViewTransition(fn);
      }
    : undefined;

export function Link(props: ComponentProps<typeof OrigLink>) {
  return <OrigLink {...props} unstable_startTransition={startViewTransition} />;
}
