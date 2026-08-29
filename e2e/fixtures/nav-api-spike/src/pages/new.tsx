export default function NewPage() {
  return <h1 data-testid="redirect-new">New</h1>;
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
