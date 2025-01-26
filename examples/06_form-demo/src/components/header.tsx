import { Link } from 'waku';

export const Header = () => {
  return (
    <header className="flex items-center gap-4 p-6 lg:fixed lg:left-0 lg:top-0">
      <h2 className="text-lg font-bold tracking-tight">
        <Link to="/">Waku form demo</Link>
      </h2>
      <a
        href="https://github.com/dai-shi/waku/tree/main/examples/06_form-demo"
        target="_blank"
        rel="noreferrer"
        className="text-sm hover:underline"
      >
        (source)
      </a>
    </header>
  );
};
