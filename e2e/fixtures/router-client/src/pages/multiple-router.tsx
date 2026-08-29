import type { PageProps } from 'waku/router';
import { NestedRouteState } from '../components/multiple-routers.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function MultipleRouterPage({
  query,
}: PageProps<'/multiple-router'>) {
  await sleep(query === 'name=first' ? 100 : 300);
  return (
    <div>
      <h2>Nested Router</h2>
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
