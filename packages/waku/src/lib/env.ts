// The use of `globalThis` in this file is more or less a hack.
// It should be revisited with a better solution.

/**
 * This is an internal function and not for public use.
 */
export function setAllEnv(newEnv: Readonly<Record<string, string>>) {
  (globalThis as any).__WAKU_SERVER_ENV__ = newEnv;
}

export function getEnv(key: string): string | undefined {
  return (globalThis as any).__WAKU_SERVER_ENV__?.[key];
}
