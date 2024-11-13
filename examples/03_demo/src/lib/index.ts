import { pokemon } from './pokemon';

/**
 * Mock database
 * @param {TemplateStringsArray} query: mock query string
 */
export const sql = async (_query: TemplateStringsArray) => {
  const shuffledPokemon = shuffle(pokemon).slice(0, 9);

  return { rows: shuffledPokemon };
};

const shuffle = (array: Array<any>) => {
  return array
    .map((value: any) => ({ value, sort: Math.random() }))
    .sort((a: any, b: any) => a.sort - b.sort)
    .map(({ value }: any) => value);
};

/**
 * Mock static paths
 */
export const getPokemonPaths = async (): Promise<string[]> => {
  return pokemon.map((row: any) => row.slug);
};
