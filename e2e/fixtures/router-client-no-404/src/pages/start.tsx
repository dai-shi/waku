import { Link } from 'waku';
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
      <div style={{ minHeight: '140vh' }} />
      <p>
        <Link
          to="/view-target?from=view"
          unstable_prefetchOnView={{}}
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
