import {
  createLoader,
  createSerializer,
  parseAsInteger,
  parseAsString,
} from 'nuqs/server';
import type { Unstable_SearchCodec } from 'waku/router';

const parsers = {
  q: parseAsString.withDefault(''),
  page: parseAsInteger.withDefault(1),
};

const loadSearch = createLoader(parsers);
const serializeSearch = createSerializer(parsers);

type NuqsSearch = { q: string; page: number };

export const nuqsSearchCodec = {
  id: 'nuqs',
  // { strict: true } makes the loader throw on a bad value -> Waku 400
  parse: (query: string): NuqsSearch =>
    loadSearch(new URLSearchParams(query), { strict: true }),
  // createSerializer prepends "?"; the codec returns the query without it
  serialize: (search: NuqsSearch): string =>
    serializeSearch(search).replace(/^\?/, ''),
} satisfies Unstable_SearchCodec<NuqsSearch>;
