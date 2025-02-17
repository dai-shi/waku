import { Link } from 'waku';
// @ts-expect-error no types
// eslint-disable-next-line import/no-unresolved
import { Hello } from 'dummy-library/entry-point';
// @ts-expect-error no types
// eslint-disable-next-line import/no-unresolved
import { ContextProvider, ContextConsumer } from 'context-library/entry-point';

import { Counter } from '../components/counter';

export default async function HomePage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1 style={{ fontSize: 32, fontWeight: 'bold' }} data-testid="header">
        {data.headline}
      </h1>
      <Hello />
      <p>{data.body}</p>
      <Counter />
      <Link
        to="/about"
        style={{
          marginTop: 16,
          display: 'inline-block',
          textDecoration: 'underline',
        }}
      >
        About page
      </Link>
      <ContextProvider>
        <ContextConsumer />
      </ContextProvider>
    </div>
  );
}

const getData = async () => {
  const data = {
    title: 'Waku',
    headline: 'Waku',
    body: 'Hello world!',
  };

  return data;
};

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
