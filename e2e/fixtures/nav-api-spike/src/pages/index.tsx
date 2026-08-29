export default function HomePage() {
  return <h1 data-testid="home">Home</h1>;
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
