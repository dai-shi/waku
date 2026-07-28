declare module 'cloudflare:workers' {
  export const env: {
    MAX_ITEMS: number;
    QUEUE: {
      send(message: string): Promise<void>;
    };
  };
  export const waitUntil: (promise: Promise<unknown>) => void;
}
