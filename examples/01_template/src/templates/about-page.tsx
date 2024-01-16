import { Link } from 'waku';

export const AboutPage = async () => {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1>{data.title}</h1>
      <p>{data.body}</p>
      <Link to="/">Return home</Link>
    </div>
  );
};

const getData = async () => {
  const data = {
    title: 'About Waku',
    body: 'The minimal React framework',
  };

  return data;
};
