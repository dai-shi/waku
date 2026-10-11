import type { CreatePagesConfig, RouteConfig } from '../base-types.js';
import type { PagePath } from '../create-pages-utils/inferred-path-types.js';
import { getPathMapping, parsePathWithSlug } from './path-spec.js';
import { getGrouplessPath } from './route-path.js';

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

declare const constructedHref: unique symbol;

export type NormalizePath<
  Path extends string,
  Prefix extends string = '',
> = string extends Path
  ? string
  : Path extends `${infer Segment}/${infer Rest}`
    ? NormalizePath<
        Rest,
        Segment extends '' | `(${string}` ? Prefix : `${Prefix}/${Segment}`
      >
    : Path extends '' | `(${string}`
      ? Prefix extends ''
        ? '/'
        : Prefix
      : `${Prefix}/${Path}`;

export type ConstructedHref<Path extends string> = string & {
  readonly [constructedHref]: NormalizePath<Path>;
};

export type NavigationHref = RouteHref | ConstructedHref<RoutePath>;

export const buildRouteHref = (
  path: string,
  params?: Record<string, unknown>,
): string => {
  const pathSpec = parsePathWithSlug(getGrouplessPath(path));
  const segments: string[] = [];
  for (const item of pathSpec) {
    if (item.type === 'literal') {
      segments.push(item.name);
    } else if (item.type === 'wildcard') {
      const value = item.name ? params?.[item.name] : undefined;
      if (
        !Array.isArray(value) ||
        value.some((part) => typeof part !== 'string' || part === '')
      ) {
        throw new Error(`Missing catch-all param "${item.name}" for "${path}"`);
      }
      for (const part of value) {
        segments.push(encodeURIComponent(part));
      }
    } else {
      const value = item.name ? params?.[item.name] : undefined;
      if (typeof value !== 'string') {
        throw new Error(`Missing param "${item.name}" for "${path}"`);
      }
      const prefix = item.prefix ?? '';
      const suffix = item.suffix ?? '';
      segments.push(prefix + encodeURIComponent(value) + suffix);
    }
  }
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`Cannot build "${path}" with dot-segment params`);
  }
  const pathname = '/' + segments.join('/');
  if (!getPathMapping(pathSpec, pathname)) {
    throw new Error(`Cannot build "${path}" with the given params`);
  }
  return pathname;
};
