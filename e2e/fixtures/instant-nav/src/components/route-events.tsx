'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'waku/router/client';

// Records the path of the last completed navigation so tests can assert that
// route-change events fire for the final (reconciled) route.
export function RouteEvents() {
  const { unstable_events } = useRouter();
  const [lastComplete, setLastComplete] = useState('');
  useEffect(() => {
    const handler = (route: { path: string }) => setLastComplete(route.path);
    unstable_events.on('complete', handler);
    return () => unstable_events.off('complete', handler);
  }, [unstable_events]);
  return <div data-testid="last-complete">{lastComplete}</div>;
}
