import { DEV_BUILD_ID } from '../constants.js';
import { createInitialRscEntryCode } from './initial-rsc.js';

function getRecoveryBuildId(): string | undefined {
  const buildId = import.meta.env?.WAKU_BUILD_ID;
  if (!buildId || buildId === DEV_BUILD_ID) {
    return undefined;
  }
  return buildId;
}

// https://github.com/wakujs/waku/issues/2238
// Must run before the bootstrap import. Defer reload until DOMContentLoaded
// (streaming HTML is unreliable). Persist a build-id marker so a broken build
// cannot loop forever.
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

// Bare import() does not fire vite:preloadError; mirror __vitePreload so the
// recovery listener above runs. https://github.com/wakujs/waku/issues/2238
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
