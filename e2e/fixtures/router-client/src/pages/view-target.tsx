import { RouteState } from '../components/route-state.js';
import { ViewTargetMarker } from '../components/view-target-marker.js';
import { ViewTransitionProbe } from '../components/view-transition-probe.js';

export default function ViewTargetPage() {
  return (
    <ViewTransitionProbe>
      <div>
        <h1>View Target</h1>
        <RouteState />
        <ViewTargetMarker />
      </div>
    </ViewTransitionProbe>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
