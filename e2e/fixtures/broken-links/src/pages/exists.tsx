import { Link } from 'waku';

const Page = () => (
  <div>
    <h1>Existing page</h1>
    <p>
      <Link to="/">Back</Link>
    </p>
  </div>
);

export const getConfig = async () => {
  return {
    render: 'dynamic',
  };
};

export default Page;
