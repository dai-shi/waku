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
export function iterateSerializablePlatformDataInternal(): Iterable<
  [string, unknown]
> {
  const platformData: Record<string, [unknown, boolean]> = ((
    globalThis as any
  ).__WAKU_SERVER_PLATFORM_DATA__ ||= {});
  return Object.entries(platformData).flatMap(([key, [data, serializable]]) =>
    serializable ? [[key, data]] : [],
  );
}

/**
 * This is an internal function and not for public use.
 */
export function setPlatformDataLoaderInternal(
  loader: (key: string) => Promise<unknown>,
): void {
  (globalThis as any).__WAKU_SERVER_PLATFORM_DATA_LOADER__ = loader;
}

export async function unstable_setPlatformData<T>(
  key: string,
  data: T,
  serializable: boolean,
): Promise<void> {
  const platformData: Record<string, [unknown, boolean]> = ((
    globalThis as any
  ).__WAKU_SERVER_PLATFORM_DATA__ ||= {});
  platformData[key] = [data, serializable];
}

export async function unstable_getPlatformData<T>(
  key: string,
): Promise<T | undefined> {
  const platformData: Record<string, [unknown, boolean]> = ((
    globalThis as any
  ).__WAKU_SERVER_PLATFORM_DATA__ ||= {});
  const item = platformData[key];
  if (item) {
    return item[0] as T;
  }
  const loader: ((key: string) => Promise<unknown>) | undefined = (
    globalThis as any
  ).__WAKU_SERVER_PLATFORM_DATA_LOADER__;
  if (loader) {
    return loader(key) as T;
  }
}

export function unstable_getHeaders(): Readonly<Record<string, string>> {
  return getContext().req.headers;
}

type BuildOptions = {
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

// TODO tentative name
export function unstable_getBuildOptions(): BuildOptions {
  return ((globalThis as any).__WAKU_BUILD_OPTIONS__ ||= {});
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
