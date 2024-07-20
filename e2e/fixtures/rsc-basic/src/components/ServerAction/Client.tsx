'use client';

import { useActions } from 'ai/rsc';
import { useEffect } from 'react';

export const ClientActionsConsumer = () => {
  const actions = useActions();
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    globalThis.actions = actions;
  }, [actions]);
  return <div>globalThis.actions: {JSON.stringify(Object.keys(actions))}</div>;
};
