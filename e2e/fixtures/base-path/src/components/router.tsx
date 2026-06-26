'use client';

import { ComponentProps } from 'react';
import { Link, useRouter } from 'waku';

export function ClickLink(
  props: ComponentProps<typeof Link> & { replace?: boolean },
) {
  const router = useRouter();
  const { to } = props;
  const navigate = props.replace ? router.replace : router.push;
  return (
    <button
      onClick={async () => {
        if (typeof to === 'string') {
          await navigate(to);
        } else {
          await navigate(to);
        }
      }}
    >
      {props.children}
    </button>
  );
}
