import { Link } from 'waku';

export const Header = () => {
  return (
    <header
      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16 }}
    >
      <h2 style={{ fontSize: 32, fontWeight: 'bold' }}>
        <Link to="/">Waku starter</Link>
      </h2>
    </header>
  );
};
