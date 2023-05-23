import type { IncomingMessage, ServerResponse } from "node:http";

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void
) => void;

export function rsc(_options: {
  mode: "development" | "production";
}): Middleware {
  // TODO
  return (_req, _res, _next) => {
  };
}
