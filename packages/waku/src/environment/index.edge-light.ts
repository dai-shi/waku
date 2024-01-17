export function getEnv(key: string): string | undefined {
  return process.env[key];
}
