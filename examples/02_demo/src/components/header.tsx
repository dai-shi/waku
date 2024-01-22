import { Link } from 'waku';

export const Header = () => {
  return (
    <header className="fixed left-0 top-0 p-6">
      <h2 className="text-lg font-bold tracking-tight">
        <Link to="/">Waku pokemon</Link>
      </h2>
    </header>
  );
};
