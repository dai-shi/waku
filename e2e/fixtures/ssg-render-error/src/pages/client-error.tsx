import { ThrowsInClient } from '../components/throws-in-client.js';

export default function ClientErrorPage() {
  return (
    <div>
      <p>Client Error Page</p>
      <ThrowsInClient />
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
