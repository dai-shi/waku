import { unstable_getGrouplessPath as getGrouplessPath } from '../../minimal/server.js';
import type { CreatePagesConfig, RouteConfig } from '../base-types.js';
import type {
  PagePath,
  RouteParams,
  RouteSearch,
  Unstable_SearchCodec,
} from '../create-pages-utils/inferred-path-types.js';
import { getPathMapping, parsePathWithSlug } from './path-spec.js';

export type RoutePath = [PagePath<CreatePagesConfig>] extends [never]
  ? string
  : PagePath<CreatePagesConfig>;

type AllowTrailingSlash<Path extends string> = Path extends '/'
  ? Path
  : Path | `${Path}/`;

type AllowPathDecorators<Path extends string> = Path extends unknown
  ? | AllowTrailingSlash<Path>
    | `${AllowTrailingSlash<Path>}?${string}`
    | `${AllowTrailingSlash<Path>}#${string}`
    | `?${string}`
    | `#${string}`
  : never;

export type RouteHref = RouteConfig extends {
  paths: infer UserPaths extends string;
}
  ? AllowPathDecorators<UserPaths>
  : string;

type RouteParamsInput<Path extends RoutePath> = {
  [Key in keyof RouteParams<Path>]: RouteParams<Path>[Key] extends string[]
    ? readonly string[]
    : RouteParams<Path>[Key];
};

export type BuildRouteHrefTarget<Path extends RoutePath> = {
  to: Path;
  search?: RouteSearch<Path>;
  hash?: string;
} & (keyof RouteParamsInput<Path> extends never
  ? { params?: never }
  : { params: RouteParamsInput<Path> });

/**
 * Build an href string from a route path, params, search, and hash.
 *
 * Route groups in the path are removed, path params are URL-encoded, and the
 * result is validated against the route matcher; building a pathname that the
 * path would not match (e.g. an empty array for a prefixed catch-all) throws.
 */
export const buildRouteHref = <Path extends RoutePath>(
  target: BuildRouteHrefTarget<Path>,
  resolveCodec?: (routePath: string) => Unstable_SearchCodec<any> | undefined,
): string => {
  const { to, search, hash, params } = target as {
    to: string;
    search?: Record<string, unknown>;
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
  let query = '';
  if (search !== undefined) {
    const codec = resolveCodec?.(to);
    if (!codec) {
      throw new Error(
        `Cannot serialize "search" for "${to}": no search codec resolved. Provide it via <Unstable_SearchCodecsProvider> in a module rendered on every page (e.g. your root layout) so navigation can serialize it.`,
      );
    }
    query = codec.serialize(search);
  }
  return (
    pathname +
    (query ? '?' + query : '') +
    (hash ? '#' + (hash.startsWith('#') ? hash.slice(1) : hash) : '')
  );
};
