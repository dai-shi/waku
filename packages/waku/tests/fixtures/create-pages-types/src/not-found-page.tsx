import { Link } from 'waku';

export const NotFoundPage = () => (
  <p>
    <Link to="/">Home</Link>
    {/* @ts-expect-error unknown route */}
    <Link to="/missing">Missing</Link>
  </p>
);
