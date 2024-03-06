import { createElement } from 'react';
import type { ComponentProps, FunctionComponent, ReactNode } from 'react';

import { defineEntries } from '../server.js';
import type { RenderEntries, GetBuildConfig, GetSsrConfig } from '../server.js';
import { Children, Slot } from '../client.js';
import {
  getComponentIds,
  getInputString,
  parseInputString,
  PARAM_KEY_SKIP,
  SHOULD_SKIP_ID,
} from './common.js';
import type { RouteProps, ShouldSkip } from './common.js';
import { getPathMapping } from '../lib/utils/path.js';
import type { PathSpec } from '../lib/utils/path.js';
import { ServerRouter } from './client.js';

// TODO revisit shouldSkip API
const ShoudSkipComponent = ({ shouldSkip }: { shouldSkip: ShouldSkip }) =>
  createElement('meta', {
    name: 'waku-should-skip',
    content: JSON.stringify(shouldSkip),
  });

export function unstable_defineRouter(
  getPathConfig: () => Promise<
    Iterable<{ path: PathSpec; isStatic?: boolean; noSsr?: boolean }>
  >,
  getComponent: (
    componentId: string, // "**/layout" or "**/page"
    /**
     * HACK setShouldSkip API is too hard to understand
     */
    setShouldSkip: (val?: ShouldSkip[string]) => void,
  ) => Promise<
    | FunctionComponent<RouteProps>
    | FunctionComponent<RouteProps & { children: ReactNode }>
    | { default: FunctionComponent<RouteProps> }
    | { default: FunctionComponent<RouteProps & { children: ReactNode }> }
    | null
  >,
): ReturnType<typeof defineEntries> {
  const pathConfigPromise = getPathConfig().then((pathConfig) =>
    Array.from(pathConfig).map((item) => {
      const is404 =
        item.path.length === 1 &&
        item.path[0]!.type === 'literal' &&
        item.path[0]!.name === '404';
      return { ...item, is404 };
    }),
  );
  const has404Promise = pathConfigPromise.then((pathConfig) =>
    pathConfig.some(({ is404 }) => is404),
  );
  const existsPath = async (
    pathname: string,
  ): Promise<false | true | 'NO_SSR'> => {
    const pathConfig = await pathConfigPromise;
    const found = pathConfig.find(({ path: pathSpec }) =>
      getPathMapping(pathSpec, pathname),
    );
    return found ? (found.noSsr ? 'NO_SSR' : true) : false;
  };
  const shouldSkip: ShouldSkip = {};

  const renderEntries: RenderEntries = async (input, searchParams) => {
    const pathname = parseInputString(input);
    if (!existsPath(pathname)) {
      return null;
    }
    const skip = searchParams.getAll(PARAM_KEY_SKIP) || [];
    const componentIds = getComponentIds(pathname);
    const props: RouteProps = { path: pathname, searchParams };
    const entries = (
      await Promise.all(
        componentIds.map(async (id) => {
          if (skip?.includes(id)) {
            return [];
          }
          const mod = await getComponent(id, (val) => {
            if (val) {
              shouldSkip[id] = val;
            } else {
              delete shouldSkip[id];
            }
          });
          const component = mod && 'default' in mod ? mod.default : mod;
          if (!component) {
            return [];
          }
          const element = createElement(
            component as FunctionComponent<RouteProps>,
            props,
            createElement(Children),
          );
          return [[id, element]] as const;
        }),
      )
    ).flat();
    entries.push([
      SHOULD_SKIP_ID,
      createElement(ShoudSkipComponent, { shouldSkip }) as any,
    ]);
    return Object.fromEntries(entries);
  };

  const getBuildConfig: GetBuildConfig = async (
    unstable_collectClientModules,
  ) => {
    const pathConfig = await pathConfigPromise;
    const path2moduleIds: Record<string, string[]> = {};
    for (const { path: pathSpec } of pathConfig) {
      if (pathSpec.some(({ type }) => type !== 'literal')) {
        continue;
      }
      const pathname = '/' + pathSpec.map(({ name }) => name).join('/');
      const input = getInputString(pathname);
      const moduleIds = await unstable_collectClientModules(input);
      path2moduleIds[pathname] = moduleIds;
    }
    const customCode = `
globalThis.__WAKU_ROUTER_PREFETCH__ = (path) => {
  const path2ids = ${JSON.stringify(path2moduleIds)};
  for (const id of path2ids[path] || []) {
    import(id);
  }
};`;
    const buildConfig: {
      pathname: PathSpec;
      isStatic: boolean;
      entries: { input: string; isStatic: boolean }[];
      customCode: string;
    }[] = [];
    for (const { path: pathSpec, isStatic = false, is404 } of pathConfig) {
      const entries: (typeof buildConfig)[number]['entries'] = [];
      if (pathSpec.every(({ type }) => type === 'literal')) {
        const pathname = '/' + pathSpec.map(({ name }) => name).join('/');
        const input = getInputString(pathname);
        entries.push({ input, isStatic });
      }
      buildConfig.push({
        pathname: pathSpec,
        isStatic,
        entries,
        customCode:
          customCode + (is404 ? 'globalThis.__WAKU_ROUTER_404__ = true;' : ''),
      });
    }
    return buildConfig;
  };

  const getSsrConfig: GetSsrConfig = async (pathname, { searchParams }) => {
    const found = await existsPath(pathname);
    if (found === 'NO_SSR') {
      return null;
    }
    if (!found) {
      if (await has404Promise) {
        pathname = '/404';
      } else {
        return null;
      }
    }
    const componentIds = getComponentIds(pathname);
    const input = getInputString(pathname);
    const body = createElement(
      ServerRouter as FunctionComponent<
        Omit<ComponentProps<typeof ServerRouter>, 'children'>
      >,
      { loc: { path: pathname, searchParams } },
      createElement(Slot, { id: SHOULD_SKIP_ID }),
      componentIds.reduceRight(
        (acc: ReactNode, id) => createElement(Slot, { id, fallback: acc }, acc),
        null,
      ),
    );
    return { input, body };
  };

  return { renderEntries, getBuildConfig, getSsrConfig };
}
