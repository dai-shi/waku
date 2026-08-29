import type { PageProps } from 'waku/router';
import { NestedRouteState } from '../components/multiple-routers.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function OtherRouterPage({
  query,
}: PageProps<'/other-router'>) {
  await sleep(600);
  return (
    <div>
      <h2>Other Nested Router</h2>
      <p data-testid="server-query">{query}</p>
      <NestedRouteState />
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
