'use client';

import { useOptimistic } from 'react';

export const OptimisticActionForm = ({
  submittedName,
  submit,
}: {
  submittedName: string;
  submit: (formData: FormData) => Promise<void>;
}) => {
  const [optimisticName, setOptimisticName] = useOptimistic(submittedName);
  return (
    <form
      action={async (formData) => {
        setOptimisticName(String(formData.get('name') || '') + ' (pending)');
        await submit(formData);
      }}
    >
      <p data-testid="optimistic-action-message">
        {optimisticName ? `Submitted: ${optimisticName}` : 'No submission'}
      </p>
      <label htmlFor="optimistic-action-name">Name</label>
      <input id="optimistic-action-name" name="name" required />
      <button type="submit">Submit Optimistic</button>
    </form>
  );
};
