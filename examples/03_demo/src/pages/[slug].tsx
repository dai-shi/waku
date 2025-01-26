import { Link } from 'waku';
import type { PageProps } from 'waku/router';

import { getPokemonPaths } from '../lib';
import { pokemon } from '../lib/pokemon';

export default async function PokemonPage({ slug }: PageProps<'/[slug]'>) {
  const pokemon = await getPokemon(slug);

  if (!pokemon) {
    return null;
  }

  const stats = Object.entries(pokemon.base);

  return (
    <>
      <title>{`Waku ${pokemon.name.english}`}</title>
      <div className="w-full p-6">
        <div className="mx-auto flex w-full shrink-0 flex-col items-center justify-center gap-6 rounded-xl bg-gray-50 p-12 leading-none md:w-full md:max-w-xl">
          <div>
            <ul className="flex items-center justify-center gap-1.5">
              {pokemon.type.map((type: string) => (
                <div
                  key={type}
                  className="rounded-full bg-gray-200 px-3 py-1 text-xs font-bold uppercase leading-none tracking-wide text-black/60"
                >
                  {type}
                </div>
              ))}
            </ul>
          </div>
          <div className="inline-flex aspect-square flex-col items-center justify-center">
            <img
              src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`}
              alt={pokemon.slug}
              className="block size-[144px] shrink-0"
            />
            <div className="flex flex-col items-center justify-center gap-1 text-2xl leading-none">
              <span className="font-bold">{pokemon.name.english}</span>
              <span className="font-zen-maru-gothic text-[0.875em] font-bold opacity-40">
                {pokemon.name.japanese}
              </span>
            </div>
          </div>
          <div className="hidden lg:block">
            <ul className="mx-auto flex w-32 flex-col flex-wrap justify-center gap-1.5">
              {stats.map(([stat, value]: any) => (
                <li
                  key={stat}
                  className="rounded-xs inline-block bg-black px-1.5 py-1 text-[0.5rem] font-bold uppercase tracking-wider text-white"
                >
                  {stat}: {value}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-12">
            <Link
              to="/"
              className="inline-flex aspect-square size-16 items-center justify-center rounded-full bg-black text-sm font-bold text-white"
            >
              <span>back</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

const getPokemon = async (slug: string) => {
  return pokemon.find((row: any) => row.slug === slug) ?? null;
};

export const getConfig = async () => {
  const pokemonPaths = await getPokemonPaths();

  return {
    render: 'static',
    staticPaths: pokemonPaths,
  } as const;
};
