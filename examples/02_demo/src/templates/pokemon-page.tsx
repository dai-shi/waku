import { Link } from 'waku';
import { pokemon } from '../lib/pokemon.js';

type PokemonPageProps = { slug: string };

export const PokemonPage = async ({ slug }: PokemonPageProps) => {
  const pokemon = await getPokemon(slug);

  if (!pokemon) return null;

  const stats = Object.entries(pokemon.base);

  return (
    <>
      <title>{`Waku ${pokemon.name.english}`}</title>
      <div className="mx-auto flex w-1/2 flex-col items-center justify-center gap-6 leading-none md:w-full md:max-w-xl">
        <div>
          <ul className="flex items-center justify-center gap-1.5">
            {pokemon.type.map((type) => (
              <div
                key={type}
                className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold uppercase leading-none tracking-wide text-black/60"
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
            className="size-[144px]"
          />
          <div className="flex flex-col items-center justify-center gap-1 text-2xl leading-none">
            <span className="font-bold">{pokemon.name.english}</span>
            <span className="font-zen-maru-gothic text-[0.875em] font-bold opacity-40">
              {pokemon.name.japanese}
            </span>
          </div>
        </div>
        <div>
          <ul className="mx-auto flex w-32 flex-col flex-wrap justify-center gap-1.5">
            {stats.map(([stat, value]: any) => (
              <li
                key={stat}
                className="inline-block rounded-sm bg-black px-1.5 py-1 text-[0.5rem] font-bold uppercase tracking-wider text-white"
              >
                {stat}: {value}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-12">
          <Link
            to="/"
            className="inline-block rounded-xl bg-gray-100 px-6 py-4 font-bold transition-colors duration-500 ease-in-out hover:bg-gray-200"
          >
            back
          </Link>
        </div>
      </div>
    </>
  );
};

const getPokemon = async (slug: string) => {
  return pokemon.find((row) => row.slug === slug) ?? null;
};
