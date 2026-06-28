import { Suspense } from 'react';
import { Slice } from 'waku/router/client';

export default function Widget() {
  return (
    <div>
      <h2 data-testid="widget-static">Widget (static)</h2>
      <Suspense
        fallback={<span data-testid="clock-skeleton">loading clock...</span>}
      >
        <Slice id="clock" />
      </Suspense>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
    slices: ['clock'],
  } as const;
};
