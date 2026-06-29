import type { FunctionComponent, ReactNode } from 'react';
import type { ImportGlobFunction } from 'vite/types/importGlob.d.ts';
import { unstable_isIgnoredPath as isIgnoredPath } from '../minimal/server.js';
import type { Unstable_SearchCodec } from './create-pages-utils/inferred-path-types.js';
import { METHODS, createPages } from './create-pages.js';
import type { Method } from './create-pages.js';
import type { HandlerInterceptor } from './define-router.js';

declare global {
  interface ImportMeta {
    glob: ImportGlobFunction;
  }
}

export function fsRouter(
  /**
   * A mapping from a file path to a route module, e.g.
   *   {
   *     "./pages/_layout.tsx": () => ({ default: ... }),
   *     "./pages/index.tsx": () => ({ default: ... }),
   *     "./pages/foo/index.tsx": () => ...,
   *   }
   * Intended to be created by Vite's import.meta.glob with the pages
   * directory included in the pattern, e.g.
   *   import.meta.glob("./pages/**\/*.{tsx,ts}")
   */
  modules: { [file: string]: () => Promise<unknown> },
  options?: {
    /**
     * The pages directory name. Must match the directory in the glob
     * pattern, e.g. `"pages"` for `import.meta.glob('./pages/**\/*')`.
     * Glob keys whose first segment doesn't match are ignored.
     * Defaults to `"pages"`.
     */
    pagesDir?: string;
    /** e.g. `"_api"` will detect pages in `src/pages/_api` and strip `_api` from the path. */
    apiDir?: string;
    /** e.g. `"_slices"` will detect slices in `src/pages/_slices`. */
    slicesDir?: string;
    /**
     * e.g. `"_interceptors"` will detect handler interceptors in
     * `src/pages/_interceptors`. Each module must default-export a
     * `HandlerInterceptor`.
     */
    interceptorsDir?: string;
    unstable_skipBuild?: (routePath: string) => boolean;
  },
) {
  const {
    pagesDir = 'pages',
    apiDir = '_api',
    slicesDir = '_slices',
    interceptorsDir = '_interceptors',
    unstable_skipBuild,
  } = options || {};
  return createPages(
    async ({
      createPage,
      createLayout,
      createRoot,
      createApi,
      createSlice,
      createInterceptor,
    }) => {
      const pagesDirPrefix = pagesDir + '/';
      for (const file of Object.keys(modules).sort()) {
        // Use WHATWG URL encoding for the file path (different from RFC2396-based encoding)
        const srcPath = new URL(file, 'http://localhost:3000').pathname.slice(
          1,
        );
        if (!srcPath.startsWith(pagesDirPrefix)) {
          continue;
        }
        const pathItems = srcPath
          .slice(pagesDirPrefix.length)
          .replace(/\.\w+$/, '')
          .split('/')
          .filter(Boolean);
        if (isIgnoredPath(pathItems)) {
          continue;
        }
        if (pathItems.at(0) === interceptorsDir) {
          const interceptorMod = (await modules[file]!()) as {
            default: HandlerInterceptor;
          };
          createInterceptor(interceptorMod.default);
          continue;
        }
        const mod = (await modules[file]!()) as {
          default: FunctionComponent<{ children: ReactNode }>;
          getConfig?: () => Promise<{
            render?: 'static' | 'dynamic';
            unstable_getEtag?: (props?: any) => Promise<string | undefined>;
            unstable_searchCodec?: Unstable_SearchCodec<any>;
          }>;
          GET?: (req: Request) => Promise<Response>;
        };

        const config = await mod.getConfig?.();
        const path =
          '/' +
          (['_layout', 'index', '_root'].includes(pathItems.at(-1)!)
            ? pathItems.slice(0, -1)
            : pathItems
          ).join('/');
        if (pathItems.at(-1) === '[path]') {
          throw new Error(
            'Page file cannot be named [path]. This will conflict with the path prop of the page component.',
          );
        } else if (pathItems.at(0) === apiDir) {
          // Strip the apiDir prefix from the path (e.g., _api/hello.txt -> hello.txt)
          const apiPath = '/' + pathItems.slice(1).join('/');
          if (config?.render === 'static') {
            if (Object.keys(mod).length !== 2 || !mod.GET) {
              console.warn(
                `API ${path} is invalid. For static API routes, only a single GET handler is supported.`,
              );
            }
            createApi({
              ...config,
              path: apiPath,
              render: 'static',
              method: 'GET',
              handler: mod.GET!,
              unstable_sourceFile: srcPath,
            });
          } else {
            const validMethods = new Set(METHODS);
            const handlers = Object.fromEntries(
              Object.entries(mod).flatMap(([exportName, handler]) => {
                const isValidExport =
                  exportName === 'getConfig' ||
                  exportName === 'default' ||
                  validMethods.has(exportName as Method);
                if (!isValidExport) {
                  console.warn(
                    `API ${path} has an invalid export: ${exportName}. Valid exports are: ${METHODS.join(
                      ', ',
                    )}`,
                  );
                }
                return isValidExport && exportName !== 'getConfig'
                  ? exportName === 'default'
                    ? [['all', handler]]
                    : [[exportName, handler]]
                  : [];
              }),
            );
            createApi({
              path: apiPath,
              render: 'dynamic',
              handlers,
              unstable_sourceFile: srcPath,
            });
          }
        } else if (pathItems.at(0) === slicesDir) {
          createSlice({
            component: mod.default,
            render: 'static',
            id: pathItems.slice(1).join('/'),
            ...config,
            unstable_sourceFile: srcPath,
          } as never); // FIXME avoid as never
        } else if (pathItems.at(-1) === '_layout') {
          createLayout({
            path,
            component: mod.default,
            render: 'static',
            ...config,
            unstable_sourceFile: srcPath,
          });
        } else if (pathItems.at(-1) === '_root') {
          createRoot({
            component: mod.default,
            render: 'static',
            ...config,
            unstable_sourceFile: srcPath,
          });
        } else {
          createPage({
            path,
            component: mod.default,
            render: 'static',
            ...config,
            unstable_sourceFile: srcPath,
          } as never); // FIXME avoid as never
        }
      }
      // HACK: to satisfy the return type, unused at runtime
      return null as never;
    },
    unstable_skipBuild ? { unstable_skipBuild } : undefined,
  );
}
