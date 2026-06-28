import type {
  PagePath,
  PropsForPages,
} from './create-pages-utils/inferred-path-types.js';

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
  Path extends [PagePath<CreatePagesConfig>] extends [never]
    ? string
    : PagePath<CreatePagesConfig>,
> = PropsForPages<Path>;
