import { Link } from 'waku';

import styles from './about.module.css';

export default async function AboutPage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1 className={styles.h1}>{data.headline}</h1>
      <p>{data.body}</p>
      <Link to="/" className={styles.link}>
        Return home
      </Link>
    </div>
  );
}

const getData = async () => {
  const data = {
    title: 'About',
    headline: 'About Waku',
    body: 'The minimal React framework',
  };

  return data;
};

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
