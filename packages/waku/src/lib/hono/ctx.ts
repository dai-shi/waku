import type { Context, Env } from 'hono';

import { unstable_getCustomContext } from '../../server.js';

// Internal context key
const HONO_CONTEXT = '__hono_context';

export const getHonoContext = <E extends Env = Env>() => {
  const c = unstable_getCustomContext()[HONO_CONTEXT];
  if (!c) {
    throw new Error('Hono context is not available');
  }
  return c as Context<E>;
};
