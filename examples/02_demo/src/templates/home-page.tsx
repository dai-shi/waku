import { Link } from 'waku';

import { sql } from '../lib/index.js';

export const HomePage = async () => {
  const { rows } = await sql`SELECT * FROM pokemon ORDER BY RANDOM() LIMIT 9`;

  return (
    <>
      <title>Waku Pokemon</title>
      <ul className="grid h-full w-full max-w-xl grid-cols-2 gap-6 px-6 py-20 leading-none md:grid-cols-3 md:px-0">
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
      </ul>
    </>
  );
};
