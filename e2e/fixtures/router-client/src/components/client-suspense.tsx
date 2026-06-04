'use client';

import { use } from 'react';

// A client-only suspense with no data fetch. A suspended route is invisible
// during a transition (the old page stays mounted), so the resolver can't live
// on the suspended page. Instead the still-mounted start page renders
// <ResolveClientSuspenseButton/>, which shares this module's promise and
// releases it on click. The promise is module-level, so the route suspends once
// per page load (one navigation/test).
let resolveClientSuspense = () => {};
const clientSuspensePromise = new Promise<void>((resolve) => {
  resolveClientSuspense = resolve;
});

export function ClientSuspense() {
  use(clientSuspensePromise);
  return <p data-testid="client-suspense-content">client loaded</p>;
}

export function ResolveClientSuspenseButton() {
  return (
    <button
      type="button"
      data-testid="resolve-client-suspense"
      onClick={() => resolveClientSuspense()}
    >
      Resolve client suspense
    </button>
  );
}
