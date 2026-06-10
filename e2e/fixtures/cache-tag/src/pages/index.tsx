import { Link } from 'waku';

export default function HomePage() {
  return (
    <div>
      <h1 data-testid="home-heading">Home</h1>
      <p>
        <Link to="/cached" data-testid="to-cached">
          Go to cached
        </Link>
      </p>
    </div>
  );
}
