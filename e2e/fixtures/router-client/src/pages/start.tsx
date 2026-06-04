import { Link } from 'waku';
import { ResolveClientSuspenseButton } from '../components/client-suspense.js';
import { NavIndicator } from '../components/nav-indicator.js';
import { PushMissingButton, RouteState } from '../components/route-state.js';

export default function StartPage() {
  return (
    <div>
      <h1>Start</h1>
      <RouteState />
      <p>
        <Link to="/next?x=1" data-testid="go-next">
          Go next
        </Link>
      </p>
      <p>
        <Link to="/start?from=query-only" data-testid="go-query-only">
          Go query only
        </Link>
      </p>
      <p>
        <Link to="/start#scroll-target" data-testid="go-hash-target">
          Go hash target
        </Link>
      </p>
      <p>
        <Link
          to="/next?from=enter"
          unstable_prefetchOnEnter
          data-testid="prefetch-on-enter-link"
        >
          Prefetch on enter
        </Link>
      </p>
      <p>
        <Link to="/next?from=pending" data-testid="pending-link">
          Go next with pending state
          <NavIndicator />
        </Link>
      </p>
      <p>
        <Link to="/pending-client" data-testid="pending-client-link">
          Go to a route with a client-only delay
          <NavIndicator name="client" />
        </Link>
      </p>
      <p>
        <ResolveClientSuspenseButton />
      </p>
      <p>
        <Link to="/trigger-not-found" data-testid="go-trigger-not-found">
          Go trigger not found
        </Link>
      </p>
      <p>
        <Link to="/trigger-redirect" data-testid="go-trigger-redirect">
          Go trigger redirect
        </Link>
      </p>
      <p>
        <PushMissingButton />
      </p>
      <div style={{ minHeight: '200vh' }} />
      <div id="scroll-target" data-testid="scroll-target">
        Scroll Target
      </div>
      <p>
        <Link
          to="/view-target?from=view"
          unstable_prefetchOnView
          data-testid="prefetch-on-view-link"
        >
          Prefetch on view target
        </Link>
      </p>
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
