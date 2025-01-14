import { getContext } from './middleware/context.js';

/**
 * This is an internal function and not for public use.
 */
export function setAllEnvInternal(newEnv: Readonly<Record<string, string>>) {
  (globalThis as any).__WAKU_SERVER_ENV__ = newEnv;
}

export function getEnv(key: string): string | undefined {
  return (globalThis as any).__WAKU_SERVER_ENV__?.[key];
}

export function unstable_getHeaders(): Readonly<Record<string, string>> {
  return getContext().req.headers;
}

type PlatformObject = {
  buildData?: Record<string, unknown>; // must be JSON serializable
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

(globalThis as any).__WAKU_PLATFORM_OBJECT__ ||= {};

// TODO tentative name
export function unstable_getPlatformObject(): PlatformObject {
  return (globalThis as any).__WAKU_PLATFORM_OBJECT__;
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
