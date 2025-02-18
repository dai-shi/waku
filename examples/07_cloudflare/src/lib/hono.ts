import { getHonoContext as getHonoContextFromWaku } from 'waku/unstable_hono';
import { isBuild } from './waku';

export function getHonoContext() {
  if (isBuild()) {
    return undefined;
  }
  try {
    return getHonoContextFromWaku<{ Bindings: Env }>();
  } catch (e) {
    if (isHonoContextUnavailableError(e)) {
      return undefined;
    }
    throw e;
  }
}
const isHonoContextUnavailableError = (e: unknown): boolean => {
  return e instanceof Error && e.message === 'Hono context is not available';
};
