declare module 'cloudflare:workers' {
  export const env: {
    MAX_ITEMS: number;
  };
  export const waitUntil: (promise: Promise<unknown>) => void;
}
