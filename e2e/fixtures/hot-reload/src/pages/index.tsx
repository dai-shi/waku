import { Counter } from '../components/counter.js';

export default async function HomePage() {
  return (
    <div>
      <p>Home Page</p>
      <Counter />
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
