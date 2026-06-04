import { ClientSuspense } from '../components/client-suspense.js';

export default function PendingClientPage() {
  return (
    <div>
      <h1>Pending Client</h1>
      <ClientSuspense />
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
