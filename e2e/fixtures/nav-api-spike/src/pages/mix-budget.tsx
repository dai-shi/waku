import { NavRouter } from '../nav-binding.js';

// mix-budget-a as a document request would HTTP-redirect. this root run()s
// locally so the load-time 404 hops cannot hang the owning Navigation API.
export default function MixBudgetPage() {
  return (
    <div>
      <p data-testid="mix-budget">mix budget</p>
      <div data-testid="mix-budget-host">
        <NavRouter
          ownsNavigation={false}
          initialRoute={{ path: '/mix-budget-a', query: '', hash: '' }}
        />
      </div>
    </div>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
