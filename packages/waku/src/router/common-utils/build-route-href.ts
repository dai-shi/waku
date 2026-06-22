import { getGrouplessPath } from '../../lib/utils/create-pages.js';
import { getPathMapping, parsePathWithSlug } from '../../lib/utils/path.js';
import type { CreatePagesConfig } from '../base-types.js';
import type {
  ApiParams,
  PagePath,
} from '../create-pages-utils/inferred-path-types.js';

export type RoutePattern = [PagePath<CreatePagesConfig>] extends [never]
  ? string
  : PagePath<CreatePagesConfig>;

type RouteParams<Pattern extends RoutePattern> = {
  [Key in keyof ApiParams<Pattern>]: ApiParams<Pattern>[Key] extends string[]
    ? readonly string[]
    : ApiParams<Pattern>[Key];
};

type SearchValue = string | readonly string[] | undefined;

type BuildRouteHrefSearch = Record<string, SearchValue>;

export type BuildRouteHrefTarget<Pattern extends RoutePattern> = {
  to: Pattern;
  search?: BuildRouteHrefSearch;
  hash?: string;
} & (keyof RouteParams<Pattern> extends never
  ? { params?: never }
  : { params: RouteParams<Pattern> });

const serializeSearch = (search: BuildRouteHrefSearch | undefined): string => {
  if (search === undefined) {
    return '';
  }
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        searchParams.append(key, item);
      }
    } else {
      searchParams.append(key, value as string);
    }
  }
  return searchParams.toString();
};

/**
 * Build an href string from a route pattern, params, search, and hash.
 *
 * Route groups in the pattern are removed, path params are URL-encoded, and the
 * result is validated against the route matcher; building a pathname that the
 * pattern would not match (e.g. an empty array for a prefixed catch-all) throws.
 */
export const buildRouteHref = <Pattern extends RoutePattern>(
  target: BuildRouteHrefTarget<Pattern>,
): string => {
  const { to, search, hash, params } = target as {
    to: string;
    search?: BuildRouteHrefSearch;
    hash?: string;
    params?: Record<string, string | readonly string[]>;
  };
  const pathSpec = parsePathWithSlug(getGrouplessPath(to));
  const segments: string[] = [];
  for (const item of pathSpec) {
    if (item.type === 'literal') {
      segments.push(item.name);
    } else if (item.type === 'wildcard') {
      const value = item.name ? params?.[item.name] : undefined;
      if (!Array.isArray(value)) {
        throw new Error(`Missing catch-all param "${item.name}" for "${to}"`);
      }
      for (const part of value) {
        segments.push(encodeURIComponent(part));
      }
    } else {
      const value = item.name ? params?.[item.name] : undefined;
      if (typeof value !== 'string') {
        throw new Error(`Missing param "${item.name}" for "${to}"`);
      }
      const prefix = item.prefix ?? '';
      const suffix = item.suffix ?? '';
      segments.push(prefix + encodeURIComponent(value) + suffix);
    }
  }
  const pathname = '/' + segments.join('/');
  if (!getPathMapping(pathSpec, pathname)) {
    throw new Error(`Cannot build "${to}" with the given params`);
  }
  const query = serializeSearch(search);
  return (
    pathname +
    (query ? '?' + query : '') +
    (hash ? '#' + (hash.startsWith('#') ? hash.slice(1) : hash) : '')
  );
};
