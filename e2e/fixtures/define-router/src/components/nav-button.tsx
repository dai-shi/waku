'use client';

import type { ComponentType } from 'react';
import type { LinkProps } from 'waku/router/client';

export function NavButton({
  component: Component,
  to,
}: {
  component: ComponentType<LinkProps>;
  to: LinkProps['to'];
}) {
  return <Component to={to}>Composed search</Component>;
}
