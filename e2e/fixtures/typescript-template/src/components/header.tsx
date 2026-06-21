import { Link } from 'waku';

export const Header = () => (
  <header className="border-slate-200 flex items-center gap-4 border-b px-8 py-4">
    <Link to="/">Home</Link>
    <Link to="/about">About page</Link>
  </header>
);
