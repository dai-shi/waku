import type { PathSpec } from '../isomorphic-utils/path-spec.js';

const escapeRegExp = (s: string) => s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

/**
 * Transform a path spec to a regular expression.
 */
export const path2regexp = (path: PathSpec) => {
  const parts = path.map((item) => {
    if (item.type === 'literal') {
      return escapeRegExp(item.name);
    } else if (item.type === 'group') {
      const prefix = escapeRegExp(item.prefix ?? '');
      const suffix = escapeRegExp(item.suffix ?? '');
      return `${prefix}([^/]+)${suffix}`;
    } else {
      return `(.*)`;
    }
  });
  return `^/${parts.join('/')}$`;
};
