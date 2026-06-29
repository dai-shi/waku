import { getErrorInfo } from './lib/utils/custom-errors.js';

/**
 * Experimental, the name and the behavior might change.
 */
export const unstable_allowServer = <T>(x: T) => x;

/**
 * Unsure if this is going to be a public API in the future.
 */
export const unstable_defaultRootOptions = {
  onCaughtError(error: unknown) {
    if (getErrorInfo(error)) {
      return;
    }
    console.error(error);
  },
};
