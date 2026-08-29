import { Slice_UNSTABLE as Slice } from 'waku/router/client-core';

export default function WithSlicePage() {
  return (
    <div>
      <h1 data-testid="slice-heading">Slice page</h1>
      <Slice
        id="clock"
        lazy
        fallback={<span data-testid="slice-loading">Loading slice</span>}
      />
    </div>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
