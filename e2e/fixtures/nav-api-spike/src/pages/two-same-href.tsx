import { NavRouter } from '../nav-binding.js';

export default function TwoSameHrefPage() {
  return (
    <div>
      <p data-testid="two-same-href">two same href</p>
      <div data-testid="first-host">
        <NavRouter
          ownsNavigation={false}
          initialRoute={{ path: '/canonical', query: 'v=old', hash: '' }}
        />
      </div>
      <div data-testid="second-host">
        <NavRouter
          ownsNavigation={false}
          initialRoute={{ path: '/canonical', query: 'v=old', hash: '' }}
        />
      </div>
    </div>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
