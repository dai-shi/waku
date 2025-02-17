import { Link } from 'waku';

export default async function AboutPage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1 style={{ fontSize: 32, fontWeight: 'bold' }}>{data.headline}</h1>
      <p>{data.body}</p>
      <Link
        to="/"
        style={{
          display: 'inline-block',
          marginTop: 16,
          textDecoration: 'underline',
        }}
      >
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
