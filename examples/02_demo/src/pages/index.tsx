import { Link } from 'waku';

import { Reload } from '../components/reload';
import { sql } from '../lib';

export default async function HomePage() {
  const { rows } = await sql`SELECT * FROM pokemon ORDER BY RANDOM() LIMIT 9`;

  return (
    <>
      <title>Waku pokemon</title>
      <div className="flex h-full w-full flex-col items-center justify-center p-6">
        <div className="px-6">
          <a
            href="https://github.com/dai-shi/waku/tree/main/examples/02_demo/src"
            target="_blank"
            rel="noreferrer"
            className="whitespace-nowrap text-xs font-bold hover:underline sm:text-base"
          >{`SELECT * FROM pokemon ORDER BY RANDOM() LIMIT 9`}</a>
        </div>
        <ul className="relative mt-6 grid h-full w-full max-w-xl flex-shrink-0 grid-cols-2 gap-6 leading-none md:grid-cols-3 md:px-0">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to={`/${row.slug}`}
                className="flex aspect-square w-full flex-shrink-0 flex-col items-center justify-center rounded-xl bg-gray-50 p-3 text-gray-950 transition-colors duration-500 ease-in-out hover:bg-gray-200"
              >
                <img
                  src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${row.id}.png`}
                  alt={row.slug}
                  className="size-[96px]"
                />
                <div className="flex flex-col items-center justify-center gap-1 font-bold">
                  <span className="font-bold">{row.name.english}</span>
                  <span className="font-zen-maru-gothic text-[0.875em] font-bold opacity-40">
                    {row.name.japanese}
                  </span>
                </div>
              </Link>
            </li>
          ))}
          <div className="absolute bottom-0 right-0 md:translate-x-full md:translate-y-full md:p-3">
            <Reload />
          </div>
        </ul>
      </div>
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  };
};
