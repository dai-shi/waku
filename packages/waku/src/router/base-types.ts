import type {
  PagePath,
  PropsForPages,
} from './create-pages-utils/inferred-path-types.js';

export type { PathsForPages } from './create-pages-utils/inferred-path-types.js';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RouteConfig {
  // routes to be overridden by users
}

/** Props for pages when using `createPages` */
export type PageProps<Path extends PagePath<RouteConfig>> = PropsForPages<Path>;
