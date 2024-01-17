export function getEnv(key: string): string | undefined {
  // @ts-expect-error
  return Deno.env.get(key);
}
