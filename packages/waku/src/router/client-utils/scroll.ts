import { pathnameToCurrentRoutePath } from '../client-core-utils/route-url.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';

// a run decodes together, so a multi byte character survives
const decodeHash = (raw: string) =>
  raw.replace(/(?:%[0-9A-Fa-f]{2})+/g, (escapes) => {
    try {
      return decodeURIComponent(escapes);
    } catch {
      return escapes;
    }
  });

export const getHashElement = (hash: string): HTMLElement | null => {
  const raw = hash.slice(1);
  const decoded = decodeHash(raw);
  for (const name of new Set([raw, decoded])) {
    const byId = document.getElementById(name);
    if (byId) {
      return byId;
    }
    // the spec counts anchors only, not a meta or an input
    for (const named of document.getElementsByName(name)) {
      if (named.localName === 'a') {
        return named;
      }
    }
  }
  return decoded.toLowerCase() === 'top' ? document.documentElement : null;
};

export const scrollToHash = (
  hash: string,
  behavior: ScrollBehavior,
  scrollTopForMissingHash: boolean,
) => {
  if (hash) {
    const element = getHashElement(hash);
    if (!element) {
      if (!scrollTopForMissingHash) {
        return;
      }
      window.scrollTo({
        left: 0,
        top: 0,
        behavior,
      });
      return;
    }
    const scrollMarginTop =
      Number.parseFloat(window.getComputedStyle(element).scrollMarginTop) || 0;
    window.scrollTo({
      left: 0,
      top:
        element.getBoundingClientRect().top + window.scrollY - scrollMarginTop,
      behavior,
    });
    return;
  }
  window.scrollTo({
    left: 0,
    top: 0,
    behavior,
  });
};

export const shouldScrollByDefault = (url: URL) =>
  pathnameToCurrentRoutePath(url.pathname) !==
    pathnameToCurrentRoutePath(window.location.pathname) ||
  url.hash !== window.location.hash;

export const shouldScrollForRouteChange = (
  next: RouteProps,
  prev: RouteProps,
) => next.path !== prev.path || next.hash !== prev.hash;
