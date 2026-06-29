import type { PathSpec } from '../isomorphic-utils/path-spec.js';

export const parseExactPath = (path: string): PathSpec =>
  path
    .split('/')
    .filter(Boolean)
    .map((name) => ({ type: 'literal', name }));

export function countSlugsAndWildcards(pathSpec: PathSpec) {
  let numSlugs = 0;
  let numWildcards = 0;
  for (const slug of pathSpec) {
    if (slug.type !== 'literal') {
      numSlugs++;
    }
    if (slug.type === 'wildcard') {
      numWildcards++;
    }
  }
  return { numSlugs, numWildcards };
}
