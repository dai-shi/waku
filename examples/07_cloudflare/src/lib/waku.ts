import { unstable_getBuildOptions } from 'waku/server';
import { getEnv as getWakuEnv } from 'waku';
import { getHonoContext } from './hono';

export function isBuild() {
  return !!unstable_getBuildOptions().unstable_phase;
}

export function getEnv(key: string): string | undefined {
  if (isBuild()) {
    // Environment variables present at build time in process.env
    return getWakuEnv(key);
  }
  const c = getHonoContext();
  if (!c) {
    return undefined;
  }
  // Runtime Cloudflare environment variables
  // https://developers.cloudflare.com/workers/configuration/environment-variables/
  const env = (c.env || {}) as unknown as Record<string, string | undefined>;
  return env[key];
}
