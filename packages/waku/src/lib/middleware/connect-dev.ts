import { connectWrapper } from './connect-utils.js';
import { createHandler } from '../handlers/handler-dev.js';

export function connectMiddleware(...args: Parameters<typeof createHandler>) {
  return connectWrapper(createHandler(...args));
}
