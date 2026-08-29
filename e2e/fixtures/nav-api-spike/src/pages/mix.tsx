import { NavRouter } from '../nav-binding.js';

// mix-a as a document request would HTTP-redirect. this root run()s locally
// so the load-time 404 hop cannot hang the owning Navigation API.
export default function MixPage() {
  return (
    <div>
      <p data-testid="mix">mix</p>
      <div data-testid="mix-host">
        <NavRouter
          ownsNavigation={false}
          initialRoute={{ path: '/mix-a', query: '', hash: '' }}
        />
      </div>
    </div>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
