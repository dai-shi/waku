// This is exported only for global-types.ts. It is not a public API.
export type InitialRscEntry = {
  response: Promise<Response>;
  debugId?: string;
};

export const consumeInitialRscEntry = (): InitialRscEntry | undefined => {
  const entry = globalThis.__WAKU_INITIAL_RSC__;
  if (entry) {
    globalThis.__WAKU_INITIAL_RSC__ = undefined;
  }
  return entry;
};
