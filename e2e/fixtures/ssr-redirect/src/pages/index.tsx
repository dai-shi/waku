import { Link } from 'waku';

export default async function HomePage() {
  return (
    <div>
      <h1>Home Page</h1>
      <Link to="/sync">Sync Page</Link>
      <Link to="/async">Async Page</Link>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
