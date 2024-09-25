import { Link } from 'waku';

export default function NotFound() {
  return (
    <div>
      <h1>Custom not found</h1>
      <p>
        <Link to="/">Back</Link>
      </p>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
