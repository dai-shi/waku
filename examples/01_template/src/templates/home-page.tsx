import { Link } from 'waku';

import { Counter } from '../components/counter.js';

export const HomePage = async () => {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1>{data.title}</h1>
      <p>{data.body}</p>
      <Counter />
      <Link to="/about">Learn more</Link>
    </div>
  );
};

const getData = async () => {
  const data = {
    title: 'Waku',
    body: 'Hello world!',
  };

  return data;
};
