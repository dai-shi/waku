'use client';

import {
  INTERNAL_ServerRoot as ServerRoot,
  unstable_addBase as addBase,
  unstable_callServerRsc as callServerRsc,
  unstable_removeBase as removeBase,
} from './client-runtime.js';

export {
  Root_UNSTABLE,
  Slot_UNSTABLE,
  Children_UNSTABLE,
  useFetchRsc_UNSTABLE,
  useRegisterRscEnhancer_UNSTABLE,
  useRegisterRscReloadListener_UNSTABLE,
  useElementsPromise_UNSTABLE,
  useMergeElements_UNSTABLE,
  unstable_combineElements,
  unstable_getErrorInfo,
  unstable_isImmutableElement,
} from './client-runtime.js';

/** @deprecated URL base-path handling is not part of the Minimal API. */
export const unstable_addBase = addBase;

/** @deprecated URL base-path handling is not part of the Minimal API. */
export const unstable_removeBase = removeBase;

/** @deprecated Reserved for Waku's client bootstrap. */
export const unstable_callServerRsc = callServerRsc;

/** @deprecated Reserved for Waku's HTML renderer. */
export const INTERNAL_ServerRoot = ServerRoot;
