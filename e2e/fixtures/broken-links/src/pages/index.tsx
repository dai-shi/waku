import { Link } from 'waku';

const Page = () => (
  <div>
    <h1>Index</h1>
    <p>
      <Link to="/exists">Existing page</Link>
    </p>
    <p>
      <Link to="/broken">Broken link</Link>
    </p>
  </div>
);

export const getConfig = async () => {
  return {
    render: 'dynamic',
  };
};

export default Page;
