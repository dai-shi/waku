'use client';

import { Link } from 'waku/router/client';

export function DelayedLink() {
  return (
    <Link
      to="/post/2"
      unstable_startTransition={(callback) => {
        (
          globalThis as typeof globalThis & {
            __WAKU_TEST_COMMIT_NAVIGATION__?: () => void;
          }
        ).__WAKU_TEST_COMMIT_NAVIGATION__ = callback;
      }}
      data-testid="link-delayed-post-2"
    >
      delayed post 2
    </Link>
  );
}
