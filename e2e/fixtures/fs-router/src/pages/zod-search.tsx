import type { PageProps } from 'waku/router';
import { ZodSearchControls } from '../components/zod-search-controls';
import { zodSearchCodec } from '../lib/zod-search';

export default function ZodSearchPage({ search }: PageProps<'/zod-search'>) {
  return (
    <div>
      <h2>Zod Search</h2>
      <p data-testid="zod-server-search">{JSON.stringify(search)}</p>
      <ZodSearchControls />
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
    unstable_searchCodec: zodSearchCodec,
  } as const;
};
