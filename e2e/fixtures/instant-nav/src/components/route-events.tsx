'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'waku/router/client';

// Records the path of the last completed navigation and how many completions
// fired, so tests can assert that route-change events fire for the final
// (reconciled) route and that reconciliation does not navigate twice.
export function RouteEvents() {
  const { unstable_events } = useRouter();
  const [lastComplete, setLastComplete] = useState('');
  const [completeCount, setCompleteCount] = useState(0);
  useEffect(() => {
    const handler = (route: { path: string }) => {
      setLastComplete(route.path);
      setCompleteCount((c) => c + 1);
    };
    unstable_events.on('complete', handler);
    return () => unstable_events.off('complete', handler);
  }, [unstable_events]);
  return (
    <div>
      <div data-testid="last-complete">{lastComplete}</div>
      <div data-testid="complete-count">{completeCount}</div>
    </div>
  );
}
