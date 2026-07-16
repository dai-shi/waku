'use client';

import { useRouter } from 'waku';

declare global {
  interface Window {
    __pushOutcome?: string;
  }
}

export function PushProbe() {
  const router = useRouter();
  const push = (to: string) => {
    window.__pushOutcome = 'pending';
    router.push(to as never).then(
      () => {
        window.__pushOutcome = 'resolved';
      },
      () => {
        window.__pushOutcome = 'rejected';
      },
    );
  };
  return (
    <p>
      <button
        data-testid="push-throw-redirect"
        onClick={() => push('/throw-redirect')}
      >
        Push throw-redirect
      </button>
      <button data-testid="push-missing" onClick={() => push('/missing-page')}>
        Push missing
      </button>
    </p>
  );
}
