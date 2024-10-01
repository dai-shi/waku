import { Link } from 'waku';

export default function Exists() {
  return (
    <div>
      <h1>Existing page</h1>
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
