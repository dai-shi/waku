import { createElement } from 'react';
import type { ComponentProps, FunctionComponent, ReactNode } from 'react';

import { defineEntries } from '../server.js';
import type {
  BuildConfig,
  RenderEntries,
  GetBuildConfig,
  GetSsrConfig,
} from '../server.js';
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
    Iterable<{
      path: PathSpec;
      isStatic?: boolean;
      noSsr?: boolean;
      data?: unknown; // For build: put in customData
    }>
  >,
  getComponent: (
    componentId: string, // "**/layout" or "**/page"
    options: {
      // TODO setShouldSkip API is too hard to understand
      unstable_setShouldSkip: (val?: ShouldSkip[string]) => void;
      unstable_buildConfig: BuildConfig | undefined;
    },
  ) => Promise<
    | FunctionComponent<RouteProps>
    | FunctionComponent<RouteProps & { children: ReactNode }>
    | { default: FunctionComponent<RouteProps> }
    | { default: FunctionComponent<RouteProps & { children: ReactNode }> }
    | null
  >,
): ReturnType<typeof defineEntries> {
  type MyPathConfig = {
    pathname: PathSpec;
    isStatic?: boolean | undefined;
    customData: { noSsr?: boolean; is404: boolean; data: unknown };
  }[];
  let cachedPathConfig: MyPathConfig | undefined;
  const getMyPathConfig = async (
    buildConfig?: BuildConfig,
  ): Promise<MyPathConfig> => {
    if (buildConfig) {
      return buildConfig as MyPathConfig;
    }
    if (!cachedPathConfig) {
      cachedPathConfig = Array.from(await getPathConfig()).map((item) => {
        const is404 =
          item.path.length === 1 &&
          item.path[0]!.type === 'literal' &&
          item.path[0]!.name === '404';
        return {
          pathname: item.path,
          isStatic: item.isStatic,
          customData: { is404, noSsr: !!item.noSsr, data: item.data },
        };
      });
    }
    return cachedPathConfig;
  };
  const existsPath = async (
    pathname: string,
    buildConfig: BuildConfig | undefined,
  ): Promise<['FOUND', 'NO_SSR'?] | ['NOT_FOUND', 'HAS_404'?]> => {
    const pathConfig = await getMyPathConfig(buildConfig);
    const found = pathConfig.find(({ pathname: pathSpec }) =>
      getPathMapping(pathSpec, pathname),
    );
    return found
      ? found.customData.noSsr
        ? ['FOUND', 'NO_SSR']
        : ['FOUND']
      : pathConfig.some(({ customData: { is404 } }) => is404) // FIXMEs should avoid re-computation
        ? ['NOT_FOUND', 'HAS_404']
        : ['NOT_FOUND'];
  };
  const shouldSkip: ShouldSkip = {};

  const renderEntries: RenderEntries = async (
    input,
    { searchParams, buildConfig },
  ) => {
    const pathname = parseInputString(input);
    if ((await existsPath(pathname, buildConfig))[0] === 'NOT_FOUND') {
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
          const setShoudSkip = (val?: ShouldSkip[string]) => {
            if (val) {
              shouldSkip[id] = val;
            } else {
              delete shouldSkip[id];
            }
          };
          const mod = await getComponent(id, {
            unstable_setShouldSkip: setShoudSkip,
            unstable_buildConfig: buildConfig,
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
    const pathConfig = await getMyPathConfig();
    const path2moduleIds: Record<string, string[]> = {};
    for (const { pathname: pathSpec } of pathConfig) {
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
    const buildConfig: BuildConfig = [];
    for (const { pathname: pathSpec, isStatic, customData } of pathConfig) {
      const entries: BuildConfig[number]['entries'] = [];
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
          customCode +
          (customData.is404 ? 'globalThis.__WAKU_ROUTER_404__ = true;' : ''),
        customData,
      });
    }
    return buildConfig;
  };

  const getSsrConfig: GetSsrConfig = async (
    pathname,
    { searchParams, buildConfig },
  ) => {
    const pathStatus = await existsPath(pathname, buildConfig);
    if (pathStatus[1] === 'NO_SSR') {
      return null;
    }
    if (pathStatus[0] === 'NOT_FOUND') {
      if (pathStatus[1] === 'HAS_404') {
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
