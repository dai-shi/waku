export function getEnv(key: string): string | undefined {
  return (globalThis as any).__WAKU_PRIVATE_ENV__[key]
}
