import { Link } from 'waku';

export default function AboutPage() {
  return (
    <main>
      <h1 data-testid="title">About JavaScript</h1>
      <Link to="/">Home page</Link>
    </main>
  );
}

export const getConfig = () => ({ render: 'dynamic' });
