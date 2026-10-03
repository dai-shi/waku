import type {
  Unstable_Handlers as Handlers,
  Unstable_ServerEntry as ServerEntry,
} from '../lib/types.js';
import { base64ToBytes, bytesToBase64 } from '../lib/utils/base64-web.js';
import type { buildElements } from '../lib/utils/build-elements.js';
import { getGrouplessPath } from '../lib/utils/create-pages.js';
import { isIgnoredPath } from '../lib/utils/fs-router.js';

export type {
  Unstable_Handlers,
  Unstable_HandleRequest,
  Unstable_HandleBuild,
  Unstable_RenderRsc,
  Unstable_RenderHtml,
} from '../lib/types.js';
export type { Etags as Unstable_Etags } from '../lib/utils/etags.js';
export { buildElements as unstable_buildElements } from '../lib/utils/build-elements.js';
export {
  createCustomError as unstable_createCustomError,
  getErrorInfo as unstable_getErrorInfo,
} from '../lib/utils/custom-errors.js';
export {
  formatRscUrl as unstable_formatRscUrl,
  parseRequest as unstable_parseRequest,
} from '../lib/utils/request-url.js';

/** @deprecated Pass a handler object to an adapter, annotated with `Unstable_Handlers` if needed. */
export function unstable_defineHandlers(handlers: Handlers) {
  return handlers;
}

/** @deprecated Annotate a server entry with `Unstable_ServerEntry` from `waku/adapter-builders`. */
export function unstable_defineServerEntry(fns: ServerEntry) {
  return fns;
}

export type { ElementSource as Unstable_ElementSource } from '../lib/utils/build-elements.js';

/** An element record and its etags, with slots held by the client omitted. */
export type Unstable_BuiltElements = Awaited<ReturnType<typeof buildElements>>;

/** @deprecated Build-cache serialization is not part of the Minimal API. */
export const unstable_base64ToBytes = base64ToBytes;

/** @deprecated Build-cache serialization is not part of the Minimal API. */
export const unstable_bytesToBase64 = bytesToBase64;

/** @deprecated Waku Router's route-group convention is not part of the Minimal API. */
export const unstable_getGrouplessPath = getGrouplessPath;

/** @deprecated Waku Router's filesystem conventions are not part of the Minimal API. */
export const unstable_isIgnoredPath = isIgnoredPath;
