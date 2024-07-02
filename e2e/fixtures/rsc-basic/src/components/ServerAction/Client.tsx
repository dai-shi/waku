'use client';

import { useActions } from 'ai/rsc';
import { useEffect } from 'react';

export const ClientActionsConsumer = () => {
  const actions = useActions();
  useEffect(() => {
    (globalThis as any).actions = actions;
  }, [actions]);
  return <div>{JSON.stringify(Object.keys(actions))}</div>;
};
