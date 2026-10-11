// Import the public API directly; the server barrel would cycle through createPages.
import { unstable_defineRouter } from '../define-router.js';
import {
  path2regexp,
  pathSpecAsString,
} from '../isomorphic-utils/path-spec.js';
import { getSliceSlotId } from '../isomorphic-utils/router-protocol.js';
import { createConfigRegistry } from './config-registry.js';
import { CREATE_PAGES_CONFIGS_KEY, toSerializable } from './config.js';
import type { HandlerInterceptor, RuntimeConfig } from './config.js';
import { createRouteResolver } from './route-resolver.js';

export const createConfiguredRouter = (fns: {
  getConfigs: () => Promise<Iterable<RuntimeConfig>>;
  unstable_skipBuild?: (routePath: string) => boolean;
  unstable_interceptors?: HandlerInterceptor[];
}) => {
  const registry = createConfigRegistry(fns.getConfigs);
  const resolver = createRouteResolver(registry);
  const router = unstable_defineRouter({
    resolve: resolver.resolve,
    resolveElement: resolver.resolveElement,
    getHas404: async () => registry.has404(),
    getBuildPaths: async () => {
      const targets = [];
      for (const config of registry.getAll()) {
        if (config.type === 'slice') {
          continue;
        }
        const isLiteral = config.path.every((part) => part.type === 'literal');
        const pathname = pathSpecAsString(config.path);
        if (isLiteral && fns.unstable_skipBuild?.(pathname)) {
          continue;
        }
        if (config.type === 'api') {
          if (isLiteral && config.isStatic) {
            targets.push({
              pathname,
              route: (req: Request) => config.handler(req, { params: {} }),
            });
          }
          continue;
        }
        targets.push({
          pathname,
          route: await resolver.resolveRoute(config, pathname, ''),
          prerender: isLiteral && config.isStatic,
          prefetchPattern: path2regexp(config.pathPattern ?? config.path),
        });
      }
      return targets;
    },
    getBuildElementIds: async () =>
      Promise.all(
        registry.getAll().flatMap((config) => {
          if (config.type !== 'slice' || !config.isStatic || config.pathSpec) {
            return [];
          }
          const id = getSliceSlotId(config.id);
          return [
            resolver
              .resolveElement(id, { sliceConfig: config })
              .then((source) => ({ id, source: source! })),
          ];
        }),
      ),
    ...(fns.unstable_interceptors && {
      unstable_interceptors: fns.unstable_interceptors,
    }),
  });
  const handleRequest: typeof router.handleRequest = async (input, utils) => {
    await registry.initialize(utils.loadBuildMetadata);
    return router.handleRequest(input, utils);
  };

  const handleBuild: typeof router.handleBuild = async (utils) => {
    await registry.initialize();
    const configs = registry.getAll();
    const sourceFiles = new Map<string, boolean>();
    const record = (source: { isStatic: boolean; sourceFile?: string }) => {
      if (source.sourceFile) {
        sourceFiles.set(
          source.sourceFile,
          source.isStatic && (sourceFiles.get(source.sourceFile) ?? true),
        );
      }
    };
    for (const config of configs) {
      if (config.type === 'route') {
        record(config.rootElement);
        Object.values(config.elements).forEach(record);
      } else {
        record(config);
      }
    }
    for (const [file, isStatic] of sourceFiles) {
      if (isStatic) {
        utils.unstable_registerPrunableFile(file);
      }
    }
    await router.handleBuild({
      ...utils,
      generateFile: async (path, body) => {
        try {
          await utils.generateFile(path, body);
        } catch (error) {
          if (
            error instanceof Error &&
            'code' in error &&
            error.code === 'EEXIST' &&
            configs.some(
              (config) =>
                config.type === 'api' && pathSpecAsString(config.path) === path,
            )
          ) {
            throw new Error(
              `the API route ${path} faced file-system conflicts when writing static responses, this often happens because of empty segments in "staticPaths".`,
              { cause: error },
            );
          }
          throw error;
        }
      },
    });
    await utils.saveBuildMetadata(
      CREATE_PAGES_CONFIGS_KEY,
      JSON.stringify(configs.map(toSerializable)),
    );
  };
  return {
    handleRequest,
    handleBuild,
    unstable_getRouterConfigs: async () => registry.getAll(),
  };
};
