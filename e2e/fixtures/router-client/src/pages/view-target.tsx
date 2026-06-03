import { RouteState } from '../components/route-state.js';
import { ViewTargetMarker } from '../components/view-target-marker.js';

export default function ViewTargetPage() {
  return (
    <div>
      <h1>View Target</h1>
      <RouteState />
      <ViewTargetMarker />
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
