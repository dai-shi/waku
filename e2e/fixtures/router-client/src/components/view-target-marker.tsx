'use client';

// A client component unique to /view-target, so it has its own JS chunk that is
// not loaded on /start. Used to assert prefetch warms the route's chunk.
export function ViewTargetMarker() {
  return <p data-testid="view-target-marker">view target client</p>;
}
