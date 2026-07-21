import type { ReactNode } from 'react';
import type { PathSpec } from '../isomorphic-utils/path-spec.js';
import type { Unstable_SearchCodec } from '../isomorphic-utils/search-codec-registry.js';

export type ApiHandler = (
  req: Request,
  apiContext: { params: Record<string, string | string[]> },
) => Promise<Response>;

export type HandlerInterceptor = <T>(next: () => Promise<T>) => Promise<T>;

export type SlotId = string;

export type RendererOption = { routePath: string; query: string | undefined };

export type GetEtagFromOption = (
  option: RendererOption,
) => Promise<string | undefined>;
export type GetEtagFromParams = (
  params?: Record<string, string | string[]>,
) => Promise<string | undefined>;

export type RouteConfig = {
  type: 'route';
  path: PathSpec;
  isStatic: boolean;
  pathPattern?: PathSpec;
  rootElement: {
    isStatic: boolean;
    renderer: (option: RendererOption) => ReactNode;
    getEtagFromOption?: GetEtagFromOption;
    sourceFile?: string;
  };
  routeElement: {
    isStatic: boolean;
    renderer: (option: RendererOption) => ReactNode;
    getEtagFromOption?: GetEtagFromOption;
  };
  elements: Record<
    SlotId,
    {
      isStatic: boolean;
      renderer: (option: RendererOption) => ReactNode;
      getEtagFromOption?: GetEtagFromOption;
      sourceFile?: string;
    }
  >;
  noSsr?: boolean;
  slices?: string[];
  searchCodec?: Unstable_SearchCodec<any>;
};

export type ApiConfig = {
  type: 'api';
  path: PathSpec;
  isStatic: boolean;
  handler: ApiHandler;
  sourceFile?: string;
};

export type SliceConfig = {
  type: 'slice';
  id: string;
  pathSpec?: PathSpec;
  isStatic: boolean;
  renderer: (params?: Record<string, string | string[]>) => Promise<ReactNode>;
  getEtagFromParams?: GetEtagFromParams;
  sourceFile?: string;
};

export type RuntimeConfig = RouteConfig | ApiConfig | SliceConfig;

export type SerializableRouteConfig = Omit<
  RouteConfig,
  'rootElement' | 'routeElement' | 'elements' | 'searchCodec'
> & {
  rootElement: Omit<
    RouteConfig['rootElement'],
    'renderer' | 'getEtagFromOption'
  >;
  routeElement: Omit<
    RouteConfig['routeElement'],
    'renderer' | 'getEtagFromOption'
  >;
  elements: Record<
    SlotId,
    Omit<RouteConfig['elements'][string], 'renderer' | 'getEtagFromOption'>
  >;
};

export type SerializableApiConfig = Omit<ApiConfig, 'handler'>;

export type SerializableSliceConfig = Omit<
  SliceConfig,
  'renderer' | 'getEtagFromParams'
>;

export type SerializableConfig =
  SerializableRouteConfig | SerializableApiConfig | SerializableSliceConfig;
