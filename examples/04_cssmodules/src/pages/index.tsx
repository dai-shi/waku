import { Link } from 'waku';

import styles from './index.module.css';
import { Counter } from '../components/counter';

export default async function HomePage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1 className={styles.h1}>{data.headline}</h1>
      <p>{data.body}</p>
      <Counter />
      <Link to="/about" className={styles.link}>
        About page
      </Link>
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
