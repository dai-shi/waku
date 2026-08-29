export default function StaticPage() {
  return <h1 data-testid="static">Static</h1>;
}

export const getConfig = () => ({ render: 'static' }) as const;
