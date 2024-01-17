export function getEnv(key: string): string | undefined {
  // @ts-expect-error Deno global variable
  return Deno.env.get(key);
}
