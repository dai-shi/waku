import type { ExecutionContext, Hono } from 'hono';

export type FetchAdapter = (app: Hono) => Promise<FetchHandler | undefined>;
export type FetchHandler = (
  req: Request,
  env?: unknown,
  executionCtx?: ExecutionContext,
) => Promise<Response> | Response;
