import { EXTENSIONS, SRC_MIDDLEWARE, SRC_PAGES } from '../constants.js';

export const getManagedServerEntry = (srcDir: string) => {
  const exts = EXTENSIONS.map((ext) => ext.slice(1)).join(',');
  const globPattern = `/${srcDir}/${SRC_PAGES}/**/*.{${exts}}`;
  const srcDirPrefix = `/${srcDir}/`;
  const middlewareGlob = [
    `/${srcDir}/${SRC_MIDDLEWARE}/*.{${exts}}`,
    `!/${srcDir}/${SRC_MIDDLEWARE}/*.{test,spec}.{${exts}}`,
  ];
  // Strip srcDir prefix from glob keys so fsRouter's default `pagesDir: 'pages'` applies.
  return `
import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';

const modules = Object.fromEntries(
  Object.entries(import.meta.glob(${JSON.stringify(globPattern)})).map(
    ([k, v]) => [k.slice(${srcDirPrefix.length}), v],
  ),
);

export default adapter(fsRouter(modules), {
  middlewareModules: import.meta.glob(${JSON.stringify(middlewareGlob)}),
});
`;
};

export const getManagedClientEntry = () => {
  return `
import { StrictMode, createElement } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import { Router } from 'waku/router/client';

const rootElement = createElement(StrictMode, null, createElement(Router));

if (globalThis.__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement, defaultRootOptions);
} else {
  createRoot(document, defaultRootOptions).render(rootElement);
}
`;
};
