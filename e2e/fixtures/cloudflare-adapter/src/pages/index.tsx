// eslint-disable-next-line import/no-unresolved
import { env, waitUntil } from 'cloudflare:workers';

export default function HomePage() {
  waitUntil(Promise.resolve());
  return (
    <div>
      <div data-testid="page-marker">PAGE_MARKER</div>
      <div data-testid="cloudflare-env">MAX_ITEMS={env.MAX_ITEMS}</div>
    </div>
  );
}

// Dynamic so the build prunes static-only chunks and the root/layout
// must be served from cached metadata at request time.
export const getConfig = async () => ({ render: 'dynamic' }) as const;
