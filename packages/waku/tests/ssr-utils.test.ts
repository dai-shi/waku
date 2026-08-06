import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBootstrapScriptContent,
  getBootstrapPreamble,
} from '../src/lib/utils/ssr.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createBootstrapScriptContent', () => {
  it('dispatches vite:preloadError on failure when a build id is set', () => {
    vi.stubEnv('WAKU_BUILD_ID', 'test-build');
    const content = createBootstrapScriptContent('/assets/index-abc123.js');
    expect(content).toContain('import("/assets/index-abc123.js").catch');
    expect(content).toContain('vite:preloadError');
    expect(() => new Function(content)).not.toThrow();
  });

  it('escapes the entry url', () => {
    vi.stubEnv('WAKU_BUILD_ID', 'test-build');
    const content = createBootstrapScriptContent('/a"b\\c.js');
    expect(() => new Function(content)).not.toThrow();
  });

  it('emits a terminated bare import without a build id', () => {
    // Trailing semicolon: extraScriptContent must not continue the import.
    expect(createBootstrapScriptContent('/assets/index-abc123.js')).toBe(
      'import("/assets/index-abc123.js");',
    );
  });

  it('emits a bare import in dev, where recovery stays off', () => {
    // https://github.com/wakujs/waku/issues/2238
    vi.stubEnv('WAKU_BUILD_ID', 'dev');
    expect(
      createBootstrapScriptContent(
        '/@id/__x00__virtual:vite-rsc/browser-entry',
      ),
    ).toBe('import("/@id/__x00__virtual:vite-rsc/browser-entry");');
  });
});

describe('version skew recovery code', () => {
  it('emits the reload listener when a build id is set', () => {
    vi.stubEnv('WAKU_BUILD_ID', 'test-build');
    const code = getBootstrapPreamble({ hydrate: false, initialRsc: false });
    expect(code).toContain("addEventListener('vite:preloadError'");
    expect(code).toContain('window.location.reload()');
    expect(() => new Function(code)).not.toThrow();
  });

  const runRecoveryCode = (options?: {
    sessionStorage?: Pick<Storage, 'getItem' | 'setItem'>;
    readyState?: DocumentReadyState;
  }) => {
    vi.stubEnv('WAKU_BUILD_ID', 'test-build');
    const code = getBootstrapPreamble({ hydrate: false, initialRsc: false });
    const listeners = new Map<string, ((e: unknown) => void)[]>();
    const win = {
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        listeners.set(type, [...(listeners.get(type) ?? []), fn]);
      },
      location: { reload: vi.fn() },
    };
    const docListeners = new Map<string, (() => void)[]>();
    const doc = {
      readyState: options?.readyState ?? 'complete',
      addEventListener: (type: string, fn: () => void) => {
        docListeners.set(type, [...(docListeners.get(type) ?? []), fn]);
      },
    };
    const backing = new Map<string, string>();
    const storage = options?.sessionStorage ?? {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
    };
    new Function('window', 'document', 'sessionStorage', code)(
      win,
      doc,
      storage,
    );
    const preloadError = () => {
      const e = { preventDefault: vi.fn() };
      for (const fn of listeners.get('vite:preloadError') ?? []) {
        fn(e);
      }
      return e;
    };
    const domContentLoaded = () => {
      for (const fn of docListeners.get('DOMContentLoaded') ?? []) {
        fn();
      }
    };
    return { win, backing, preloadError, domContentLoaded };
  };

  it('waits for the document before reloading mid-stream', () => {
    const { win, preloadError, domContentLoaded } = runRecoveryCode({
      readyState: 'loading',
    });
    const e = preloadError();
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(win.location.reload).not.toHaveBeenCalled();
    domContentLoaded();
    expect(win.location.reload).toHaveBeenCalledTimes(1);
  });

  it('reloads and marks the event handled on a genuine preload error', () => {
    const { win, backing, preloadError } = runRecoveryCode();
    const e = preloadError();
    expect(win.location.reload).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(backing.get('waku:preload-error-build-id')).toBe('test-build');
  });

  it('gives up after one attempt, so a broken build cannot reload forever', () => {
    const { win, preloadError } = runRecoveryCode();
    preloadError();
    const e = preloadError();
    expect(win.location.reload).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('allows one attempt per build id', () => {
    const { win, backing, preloadError } = runRecoveryCode();
    backing.set('waku:preload-error-build-id', 'previous-build');
    preloadError();
    expect(win.location.reload).toHaveBeenCalledTimes(1);
    expect(backing.get('waku:preload-error-build-id')).toBe('test-build');
  });

  // Without a marker the next load cannot tell it already retried.
  it('does not reload when sessionStorage is unavailable', () => {
    const throwing = () => {
      throw new Error('sessionStorage is disabled');
    };
    const { win, preloadError } = runRecoveryCode({
      sessionStorage: { getItem: throwing, setItem: throwing },
    });
    const e = preloadError();
    expect(win.location.reload).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('does not reload when the marker cannot be persisted', () => {
    const { win, preloadError } = runRecoveryCode({
      sessionStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota exceeded');
        },
      },
    });
    preloadError();
    expect(win.location.reload).not.toHaveBeenCalled();
  });

  it('emits nothing without a build id', () => {
    expect(getBootstrapPreamble({ hydrate: false, initialRsc: false })).toBe(
      '',
    );
  });

  it('emits nothing in dev', () => {
    vi.stubEnv('WAKU_BUILD_ID', 'dev');
    expect(getBootstrapPreamble({ hydrate: false, initialRsc: false })).toBe(
      '',
    );
  });
});

describe('getBootstrapPreamble', () => {
  it('registers the recovery listener ahead of everything else', () => {
    vi.stubEnv('WAKU_BUILD_ID', 'test-build');
    const preamble = getBootstrapPreamble({ hydrate: true, initialRsc: true });
    expect(preamble).toContain("addEventListener('vite:preloadError'");
    expect(preamble.indexOf('vite:preloadError')).toBeLessThan(
      preamble.indexOf('__WAKU_HYDRATE__'),
    );
  });

  it('omits the listener without a build id', () => {
    const preamble = getBootstrapPreamble({ hydrate: true, initialRsc: true });
    expect(preamble).not.toContain('vite:preloadError');
    expect(preamble).toContain('__WAKU_HYDRATE__');
  });
  it('provides the initial RSC payload separately from client prefetches', () => {
    const preamble = getBootstrapPreamble({
      hydrate: true,
      initialRsc: true,
      debugId: 'debug-1',
    });
    expect(preamble).toContain('globalThis.__WAKU_INITIAL_RSC__ = (() =>');
    expect(preamble).toContain('e.response = Promise.resolve(new Response(');
    expect(preamble).toContain('e.debugId = "debug-1";');
  });

  it('omits the initial RSC entry when initialRsc is false', () => {
    vi.stubEnv('WAKU_BUILD_ID', 'test-build');
    expect(
      getBootstrapPreamble({ hydrate: true, initialRsc: false }),
    ).not.toContain('__WAKU_INITIAL_RSC__');
  });

  it('strips indentation but keeps line boundaries', () => {
    // Keep newlines so a // in a snippet cannot comment out the rest.
    vi.stubEnv('WAKU_BUILD_ID', 'test-build');
    const preamble = getBootstrapPreamble({
      hydrate: true,
      initialRsc: true,
      debugId: 'debug-1',
    });
    expect(preamble).not.toMatch(/^\s|\n\s|\n\n/);
    expect(preamble.split('\n').length).toBeGreaterThan(1);
    expect(() => new Function(preamble)).not.toThrow();
  });

  it('omits the debug id when not provided', () => {
    expect(
      getBootstrapPreamble({ hydrate: true, initialRsc: true }),
    ).not.toContain('e.debugId =');
  });
});
