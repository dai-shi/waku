import { unstable_rerenderRoute } from 'waku/router/server';
import { OptimisticActionForm } from './OptimisticActionForm.js';

let submittedName = '';

async function submit(formData: FormData) {
  'use server';
  submittedName = String(formData.get('name') || '');
  unstable_rerenderRoute();
}

export function OptimisticActionPage() {
  return (
    <div>
      <h2>Optimistic Action</h2>
      <OptimisticActionForm submittedName={submittedName} submit={submit} />
    </div>
  );
}
