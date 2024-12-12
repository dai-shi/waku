import { Link } from 'waku';

export default async function AboutPage() {
  return (
    <div>
      <p>About Page</p>
      <Link to="/">Return home</Link>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
