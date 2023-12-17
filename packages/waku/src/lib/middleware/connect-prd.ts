import { connectWrapper } from './connect-utils.js';
import { createHandler } from '../handlers/handler-prd.js';

export function connectMiddleware(...args: Parameters<typeof createHandler>) {
  return connectWrapper(createHandler(...args));
}
