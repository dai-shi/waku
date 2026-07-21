'use client';

import { useActionState } from 'react';

export const StatefulForm = ({
  action,
  idPrefix = 'stateful',
  permalink,
}: {
  action: (prev: string, formData: FormData) => Promise<string>;
  idPrefix?: string;
  permalink?: string;
}) => {
  const [state, formAction] = useActionState(action, 'initial', permalink);
  return (
    <form action={formAction}>
      <p data-testid={`${idPrefix}-state`}>{state}</p>
      <button type="submit" data-testid={`${idPrefix}-submit`}>
        Stateful
      </button>
    </form>
  );
};
