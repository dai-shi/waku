import { getContext } from './middleware/context.js';

// The use of `globalThis` in this file is more or less a hack.
// It should be revisited with a better solution.

/**
 * This is an internal function and not for public use.
 */
export function setAllEnvInternal(newEnv: Readonly<Record<string, string>>) {
  (globalThis as any).__WAKU_SERVER_ENV__ = newEnv;
}

export function getEnv(key: string): string | undefined {
  return (globalThis as any).__WAKU_SERVER_ENV__?.[key];
}

/**
 * This is an internal function and not for public use.
 */
export function iterateAllPlatformDataInternal(): Iterable<[string, unknown]> {
  const platformData: Record<string, unknown> =
    (globalThis as any).__WAKU_SERVER_PLATFORM_DATA__ || {};
  return Object.entries(platformData);
}

/**
 * This is an internal function and not for public use.
 */
export function setPlatformDataLoaderInternal(
  loader: (key: string) => Promise<unknown>,
): void {
  (globalThis as any).__WAKU_SERVER_PLATFORM_DATA_LOADER__ = loader;
}

// data must be JSON serializable
export async function unstable_setPlatformData<T>(
  key: string,
  data: T,
): Promise<void> {
  ((globalThis as any).__WAKU_SERVER_PLATFORM_DATA__ ||= {})[key] = data;
}

export async function unstable_getPlatformData<T>(
  key: string,
): Promise<T | undefined> {
  const loader: ((key: string) => Promise<unknown>) | undefined = (
    globalThis as any
  ).__WAKU_SERVER_PLATFORM_DATA_LOADER__;
  if (loader) {
    return loader(key) as T;
  }
  return (globalThis as any).__WAKU_SERVER_PLATFORM_DATA__?.[key];
}

export function unstable_getHeaders(): Readonly<Record<string, string>> {
  return getContext().req.headers;
}

type PlatformObject = {
  buildOptions?: {
    deploy?:
      | 'vercel-static'
      | 'vercel-serverless'
      | 'netlify-static'
      | 'netlify-functions'
      | 'cloudflare'
      | 'partykit'
      | 'deno'
      | 'aws-lambda'
      | undefined;
    unstable_phase?:
      | 'analyzeEntries'
      | 'buildServerBundle'
      | 'buildSsrBundle'
      | 'buildClientBundle'
      | 'buildDeploy'
      | 'emitStaticFiles';
  };
} & Record<string, unknown>;

// TODO tentative name
export function unstable_getPlatformObject(): PlatformObject {
  return ((globalThis as any).__WAKU_PLATFORM_OBJECT__ ||= {});
}

export function unstable_createAsyncIterable<T extends () => unknown>(
  create: () => Promise<Iterable<T>>,
): AsyncIterable<Awaited<ReturnType<T>>>;

export function unstable_createAsyncIterable<T extends () => unknown>(
  create: () => Promise<Iterable<T>>,
) {
  return {
    [Symbol.asyncIterator]: () => {
      let tasks: T[] | undefined;
      return {
        next: async () => {
          if (!tasks) {
            tasks = Array.from(await create());
          }
          const task = tasks.shift();
          if (task) {
            return { value: await task() };
          }
          return { done: true, value: undefined };
        },
      };
    },
  };
}
