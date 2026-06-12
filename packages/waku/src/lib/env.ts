// The use of `globalThis` in this file is more or less a hack.
// It should be revisited with a better solution.

/**
 * This is an internal function and not for public use.
 */
export function setAllEnv(newEnv: Readonly<Record<string, unknown>>) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(newEnv)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }
  globalThis.__WAKU_SERVER_ENV__ = env;
}

export function getEnv(key: string): string | undefined {
  return globalThis.__WAKU_SERVER_ENV__?.[key];
}
