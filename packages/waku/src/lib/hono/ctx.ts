import type { Context, Env } from 'hono';

// This can't be relative import
import { getContext } from 'waku/middleware/context';

// Internal context key
const HONO_CONTEXT = '__hono_context';

export const getHonoContext = <E extends Env = Env>() => {
  const c = getContext().data[HONO_CONTEXT];
  if (!c) {
    throw new Error('Hono context is not available');
  }
  return c as Context<E>;
};
