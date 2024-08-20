import { createAI, getMutableAIState } from 'ai/rsc';

type UIState = {
  count: number;
};

type AIState = {
  user: string;
};

type Actions = {
  foo: () => Promise<string>;
};

export const AIProvider = createAI<AIState, UIState, Actions>({
  actions: {
    foo: async (): Promise<string> => {
      'use server';
      const mutableAIState = getMutableAIState<typeof AIProvider>();
      mutableAIState.done({
        user: 'admin',
      });
      return 'foo';
    },
  },
  initialUIState: {
    count: 0,
  },
  initialAIState: {
    user: 'guest',
  },
});
