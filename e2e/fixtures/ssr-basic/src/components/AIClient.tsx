'use client';
import { useAIState, useActions, useUIState } from 'ai/rsc';
import type { AIProvider } from '../ai/index.js';
import { useActionState, useTransition } from 'react';

export const AIClient = () => {
  const [isPending, startTransition] = useTransition();
  const [aiState] = useAIState<typeof AIProvider>();
  const actions = useActions<typeof AIProvider>();
  const [value, foo] = useActionState<string | null>(async () => {
    return actions.foo();
  }, 'click me');
  const [uiState, setUIState] = useUIState<typeof AIProvider>();
  return (
    <div>
      <div>
        <h2>AI state</h2>
        <div>
          user name:
          <span data-testid="ai-state-user">{aiState.user}</span>
        </div>
      </div>
      <div>
        <h2>UI state</h2>
        <div>
          click count:<span data-testid="ui-state-count">{uiState.count}</span>
        </div>
      </div>
      <div>
        <h2>Actions</h2>
        <button
          data-testid="action-foo"
          onClick={() => {
            startTransition(() => {
              foo();
              setUIState((state) => ({
                ...state,
                count: state.count + 1,
              }));
            });
          }}
        >
          {isPending ? 'loading...' : value}
        </button>
      </div>
    </div>
  );
};
