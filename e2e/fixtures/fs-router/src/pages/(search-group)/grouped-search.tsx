import type { PageProps } from 'waku/router';
import { GroupedSearchControls } from '../../components/grouped-search-controls';
import { demoSearchCodec } from '../../lib/search';

export default function GroupedSearchPage({
  search,
}: PageProps<'/grouped-search'>) {
  return (
    <div>
      <h2>Grouped Search</h2>
      <p data-testid="grouped-server-search">{JSON.stringify(search)}</p>
      <GroupedSearchControls />
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
    unstable_searchCodec: demoSearchCodec,
  } as const;
};
