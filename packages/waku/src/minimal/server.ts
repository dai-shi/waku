import type {
  Unstable_Handlers as Handlers,
  Unstable_ServerEntry as ServerEntry,
} from '../lib/types.js';

export function unstable_defineHandlers(handlers: Handlers) {
  return handlers;
}

export function unstable_defineServerEntry(fns: ServerEntry) {
  return fns;
}

// Expose internal APIs
// Subject to change without notice
export {
  base64ToBytes as unstable_base64ToBytes,
  bytesToBase64 as unstable_bytesToBase64,
} from '../lib/utils/base64-web.js';
export {
  createCustomError as unstable_createCustomError,
  getErrorInfo as unstable_getErrorInfo,
} from '../lib/utils/custom-errors.js';
export { getGrouplessPath as unstable_getGrouplessPath } from '../lib/utils/create-pages.js';
export { isIgnoredPath as unstable_isIgnoredPath } from '../lib/utils/fs-router.js';
