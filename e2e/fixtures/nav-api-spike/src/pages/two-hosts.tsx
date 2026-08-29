import { NavRouter } from '../nav-binding.js';

export default function TwoHostsPage() {
  return (
    <div>
      <p data-testid="two-hosts">two hosts</p>
      <div data-testid="second-host">
        <NavRouter
          ownsNavigation={false}
          initialRoute={{ path: '/bounce', query: 'v=a', hash: '' }}
        />
      </div>
    </div>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
