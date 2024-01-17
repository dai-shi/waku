export function getEnv(key: string): string | undefined {
  if (!(globalThis as any).__WAKU_PRIVATE_ENV__) {
    return undefined;
  }
  return (globalThis as any).__WAKU_PRIVATE_ENV__[key];
}
