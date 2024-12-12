import { Link } from 'waku';

import { Counter } from '../components/counter.js';

export default async function HomePage() {
  return (
    <div>
      <p>Home Page</p>
      <Counter />
      <Link to="/about" data-testid="about">
        About
      </Link>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
