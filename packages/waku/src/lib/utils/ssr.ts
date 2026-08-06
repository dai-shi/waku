import { DEV_BUILD_ID } from '../constants.js';
import { createInitialRscEntryCode } from './initial-rsc.js';

function getRecoveryBuildId(): string | undefined {
  const buildId = import.meta.env?.WAKU_BUILD_ID;
  if (!buildId || buildId === DEV_BUILD_ID) {
    return undefined;
  }
  return buildId;
}

// Must run before the bootstrap `import()`. https://github.com/wakujs/waku/issues/2238
// Reloading while the SSR HTML is still streaming is unreliable.
// Recovery is skipped unless the retry marker persists, because without it a
// broken build would reload forever.
function getVersionSkewRecoveryCode(): string {
  const buildId = getRecoveryBuildId();
  if (!buildId) {
    return '';
  }
  return `
    window.addEventListener('vite:preloadError', function (e) {
      var key = 'waku:preload-error-build-id';
      var canRetry = false;
      try {
        canRetry = sessionStorage.getItem(key) !== ${JSON.stringify(buildId)};
        sessionStorage.setItem(key, ${JSON.stringify(buildId)});
      } catch {
        canRetry = false;
      }
      if (!canRetry) {
        return;
      }
      e.preventDefault();
      var reload = function () {
        window.location.reload();
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', reload);
      } else {
        reload();
      }
    });
  `;
}

// A bare `import()` dispatches no `vite:preloadError` on failure, so mirror
// Vite's `__vitePreload` semantics to reach the recovery listener above.
// https://github.com/wakujs/waku/issues/2238
export function createBootstrapScriptContent(entryUrl: string): string {
  const entryImport = `import(${JSON.stringify(entryUrl)})`;
  if (!getRecoveryBuildId()) {
    return `${entryImport};`;
  }
  return `${entryImport}.catch((err) => {
    var e = new Event('vite:preloadError', { cancelable: true });
    e.payload = err;
    window.dispatchEvent(e);
    if (!e.defaultPrevented) {
      throw err;
    }
  });`;
}

export function getBootstrapPreamble(options: {
  hydrate: boolean;
  initialRsc: boolean;
  debugId?: string | undefined;
}) {
  return `
    ${getVersionSkewRecoveryCode()}
    ${options.hydrate ? 'globalThis.__WAKU_HYDRATE__ = true;' : ''}
    ${
      options.initialRsc
        ? `
    globalThis.__WAKU_INITIAL_RSC__ = ${createInitialRscEntryCode(
      options.debugId,
    )};
    `
        : ''
    }
  `
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}
