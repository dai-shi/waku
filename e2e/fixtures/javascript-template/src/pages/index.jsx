import { Link } from 'waku';
import { Counter } from '../components/counter';

export default function HomePage() {
  return (
    <main>
      <h1 data-testid="title">Waku JavaScript</h1>
      <Counter />
      <Link to="/about">About page</Link>
    </main>
  );
}

export const getConfig = () => ({ render: 'static' });
