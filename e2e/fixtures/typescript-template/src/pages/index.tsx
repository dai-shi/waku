import { Counter } from '../components/counter.js';

const HomePage = () => (
  <>
    <title>Waku</title>
    <h1 data-testid="title" className="text-4xl font-bold">
      Waku TypeScript
    </h1>
    <p>Hello world!</p>
    <Counter />
  </>
);

export default HomePage;

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
