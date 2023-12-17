import type { Env, Input } from 'hono';

import { honoWrapper } from './hono-utils.js';
import { createHandler } from '../handlers/handler-prd.js';

export function honoMiddleware<
  // FIXME type defaults are weird
  E extends Env = never,
  P extends string = string,
  I extends Input = Record<string, never>,
>(...args: Parameters<typeof createHandler>) {
  return honoWrapper<E, P, I>(createHandler(...args));
}
