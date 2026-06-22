import { getGrouplessPath } from '../../lib/utils/create-pages.js';
import { getPathMapping, parsePathWithSlug } from '../../lib/utils/path.js';
import type { RouteParams } from '../create-pages-utils/inferred-path-types.js';
import type { RoutePattern } from './build-route-href.js';

const safeDecodeURIComponent = (value: string): string | null => {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};

/**
 * Match a concrete pathname against a route pattern and return its params, or
 * null when the pathname does not match. This is the inverse of buildRouteHref:
 * route groups are stripped, the existing matcher decides the match, and each
 * matched segment is decoded once. The pathname must be the encoded form stored
 * by the router (e.g. useRouter().path); a pre-decoded path would double-decode
 * values containing "%". Malformed percent-encoding yields null rather than
 * throwing, since this runs during render. Catch-all matching follows the
 * router: a prefixed terminal catch-all (/docs/[...path]) does not match its
 * base (/docs), while a root catch-all (/[...path]) matches / as { path: [] }.
 */
export const matchRouteParams = <Pattern extends RoutePattern>(
  pattern: Pattern,
  pathname: string,
): RouteParams<Pattern> | null => {
  const pathSpec = parsePathWithSlug(getGrouplessPath(pattern));
  const mapping = getPathMapping(pathSpec, pathname);
  if (mapping === null) {
    return null;
  }
  const params: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(mapping)) {
    if (Array.isArray(value)) {
      const decoded: string[] = [];
      for (const part of value) {
        const decodedPart = safeDecodeURIComponent(part);
        if (decodedPart === null) {
          return null;
        }
        decoded.push(decodedPart);
      }
      params[key] = decoded;
    } else {
      const decodedValue = safeDecodeURIComponent(value);
      if (decodedValue === null) {
        return null;
      }
      params[key] = decodedValue;
    }
  }
  return params as RouteParams<Pattern>;
};
