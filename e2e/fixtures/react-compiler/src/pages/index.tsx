import { Balancer } from 'react-wrap-balancer';
import { Counter } from '../components/Counter';

export default function HomePage() {
  return (
    <main>
      <h1 data-testid="title">
        <Balancer>React Compiler fixture</Balancer>
      </h1>
      <Counter />
    </main>
  );
}

export const getConfig = () => ({ render: 'static' }) as const;
