import type { PageProps } from 'waku/router';
import { NuqsSearchControls } from '../components/nuqs-search-controls';
import { nuqsSearchCodec } from '../lib/nuqs-search';

export default function NuqsSearchPage({ search }: PageProps<'/nuqs-search'>) {
  return (
    <div>
      <h2>nuqs Search</h2>
      <p data-testid="nuqs-server-search">{JSON.stringify(search)}</p>
      <NuqsSearchControls />
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
    unstable_searchCodec: nuqsSearchCodec,
  } as const;
};
