export type Search = { page: number; tag: string };

export const productSearchCodec = {
  parse: (query: string): Search => ({
    page: Number(new URLSearchParams(query).get('page')) || 1,
    tag: new URLSearchParams(query).get('tag') ?? '',
  }),
  serialize: (search: Search) =>
    new URLSearchParams({
      page: String(search.page),
      tag: search.tag,
    }).toString(),
};
