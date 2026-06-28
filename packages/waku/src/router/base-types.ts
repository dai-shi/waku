import type { ReactNode } from 'react';
import type {
  LayoutPath,
  PagePath,
  PropsForPages,
  RouteParams,
} from './create-pages-utils/inferred-path-types.js';
import type { Prettify } from './create-pages-utils/util-types.js';

// PathsForPages collects the paths from the `createPages` result type
// GetConfigResponse is a helper for generating types with fs-router
export type {
  ApiContext,
  PathsForPages,
  GetConfigResponse,
  Unstable_SearchCodec,
  SearchCodecsForPages,
} from './create-pages-utils/inferred-path-types.js';

export interface RouteConfig {
  // routes to be overridden by users
}

export interface CreatePagesConfig {
  // routes to be overridden by users
}

export interface SearchCodecsConfig {
  // route path -> search codec, to be overridden by users (or fs-router typegen)
}

/** Props for pages when using `createPages` */
export type PageProps<
  Path extends ([PagePath<CreatePagesConfig>] extends [never]
    ? string
    : PagePath<CreatePagesConfig>),
> = PropsForPages<Path>;

/**
 * Props for layouts when using `createPages`. Adds the required `children` to
 * the layout's own route params (a layout receives neither `path`, `query`, nor
 * `search` at runtime). Validated against the generated layout paths, which can
 * include layout-only paths that have no co-located page.
 */
export type LayoutProps<
  Path extends ([LayoutPath<CreatePagesConfig>] extends [never]
    ? string
    : LayoutPath<CreatePagesConfig>),
> = Prettify<{ children: ReactNode } & RouteParams<Path>>;
