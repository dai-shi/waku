import type { PageProps } from 'waku/router';
import { productSearchCodec } from '../search.js';

export const getConfig = () =>
  ({ render: 'dynamic', unstable_searchCodec: productSearchCodec }) as const;

export default function ProductPage({
  id,
  search,
}: PageProps<'/products/[id]'>) {
  // @ts-expect-error typed search cannot be widened to any
  void search.missing;
  return (
    <p>
      {id.toUpperCase()} {search.page.toFixed()} {search.tag.toUpperCase()}
    </p>
  );
}
