import { Link } from 'waku';

export default function Index() {
  return (
    <div>
      <h1>Index</h1>
      <p>
        <Link to="/exists">Existing page</Link>
      </p>
      <p>
        <Link to="/broken">Broken link</Link>
      </p>
      <p>
        <Link to="/redirect">Correct redirect</Link>
      </p>
      <p>
        <Link to="/broken-redirect">Broken redirect</Link>
      </p>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
