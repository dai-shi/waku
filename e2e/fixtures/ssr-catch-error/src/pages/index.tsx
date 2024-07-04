import { Link } from 'waku';

export default async function HomePage() {
  return (
    <div>
      <p>Home Page</p>
      <Link to="/invalid">Invalid page</Link>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
