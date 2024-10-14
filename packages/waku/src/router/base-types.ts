import type {
  PagePath,
  PropsForPages,
} from './create-pages-utils/inferred-path-types.js';

// PathsForPages collects the paths from the `createPages` result type
export type { PathsForPages } from './create-pages-utils/inferred-path-types.js';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RouteConfig {
  // routes to be overridden by users
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CreatePagesConfig {
  // routes to be overridden by users
}

/** Props for pages when using `createPages` */
export type PageProps<Path extends PagePath<CreatePagesConfig>> =
  PropsForPages<Path>;

export const config = <
  SP extends string,
  Fig extends
    | { render: 'static'; staticPaths?: SP[] | [SP, ...SP[]][] }
    | { render: 'dynamic' },
>(
  c: Fig,
) => c;
