import type { Context, Env } from 'hono';

import { getContextData } from '../middleware/context.js';

// Internal context key
const HONO_CONTEXT = '__hono_context';

export const getHonoContext = <E extends Env = Env>() => {
  const c = getContextData()[HONO_CONTEXT];
  if (!c) {
    throw new Error('Hono context is not available');
  }
  return c as Context<E>;
};
