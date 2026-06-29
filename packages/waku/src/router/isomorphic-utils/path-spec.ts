export type PathSpecItem =
  | { type: 'literal'; name: string }
  | { type: 'group'; name?: string; prefix?: string; suffix?: string }
  | { type: 'wildcard'; name?: string };
export type PathSpec = readonly PathSpecItem[];

const SLUG_PATTERN = /^(.*?)\[([^\]]+)\](.*)$/;

export const parsePathWithSlug = (path: string): PathSpec =>
  path
    .split('/')
    .filter(Boolean)
    .map((name) => {
      const match = SLUG_PATTERN.exec(name);
      if (!match) {
        return { type: 'literal' as const, name };
      }
      const [, prefix, inner, suffix] = match;
      if (inner!.startsWith('...')) {
        return {
          type: 'wildcard' as const,
          name: inner!.slice(3),
        };
      }
      return {
        type: 'group' as const,
        name: inner!,
        ...(prefix ? { prefix } : {}),
        ...(suffix ? { suffix } : {}),
      };
    });

/** Convert a path spec to a string for the path */
export const pathSpecAsString = (path: PathSpec) => {
  return (
    '/' +
    path
      .map((item) => {
        if (item.type === 'literal') {
          return item.name;
        } else if (item.type === 'group') {
          const prefix = item.prefix ?? '';
          const suffix = item.suffix ?? '';
          return `${prefix}[${item.name}]${suffix}`;
        } else {
          return `[...${item.name}]`;
        }
      })
      .join('/')
  );
};

const matchSpecSegment = (
  spec: Exclude<PathSpecItem, { type: 'wildcard' }>,
  segment: string | undefined,
  mapping: Record<string, string | string[]>,
): boolean => {
  if (spec.type === 'literal') {
    return spec.name === segment;
  }
  if (segment === undefined) {
    return false;
  }
  const prefix = spec.prefix ?? '';
  const suffix = spec.suffix ?? '';
  if (prefix || suffix) {
    if (!segment.startsWith(prefix) || !segment.endsWith(suffix)) {
      return false;
    }
    const value = segment.slice(
      prefix.length,
      suffix ? -suffix.length : undefined,
    );
    if (!value) {
      return false;
    }
    if (spec.name) {
      mapping[spec.name] = value;
    }
  } else if (spec.name) {
    mapping[spec.name] = segment;
  }
  return true;
};

/**
 * Helper function to get the path mapping from the path spec and the pathname.
 *
 * @param pathSpec
 * @param pathname - route as a string
 * @example
 * getPathMapping(
 *   [
 *     { type: 'literal', name: 'foo' },
 *     { type: 'group', name: 'a' },
 *   ],
 *   '/foo/bar',
 * );
 * // => { a: 'bar' }
 */
export const getPathMapping = (
  pathSpec: PathSpec,
  pathname: string,
): Record<string, string | string[]> | null => {
  const actual = pathname.split('/').filter(Boolean);
  if (pathSpec.length > actual.length) {
    const wildcardIndex = pathSpec.findIndex(
      (spec) => spec.type === 'wildcard',
    );
    if (wildcardIndex === -1) {
      return null;
    }
    const isTerminalWildcard = wildcardIndex === pathSpec.length - 1;
    if (isTerminalWildcard) {
      // Terminal wildcards only pass through with zero actual segments
      // (handled by the root-wildcard special case below)
      if (actual.length > 0) {
        return null;
      }
    } else if (actual.length < pathSpec.length - 1) {
      // Non-terminal wildcards can match zero segments; just need enough
      // actual segments for every non-wildcard spec in the pathSpec
      return null;
    }
  }
  const mapping: Record<string, string | string[]> = {};
  let wildcardStartIndex = -1;
  for (let i = 0; i < pathSpec.length; i++) {
    const spec = pathSpec[i]!;
    if (spec.type === 'wildcard') {
      wildcardStartIndex = i;
      break;
    }
    if (!matchSpecSegment(spec, actual[i], mapping)) {
      return null;
    }
  }
  if (wildcardStartIndex === -1) {
    if (pathSpec.length !== actual.length) {
      return null;
    }
    return mapping;
  }

  if (wildcardStartIndex === 0 && actual.length === 0) {
    const wildcardName = pathSpec[wildcardStartIndex]!.name;
    if (wildcardName) {
      mapping[wildcardName] = [];
    }
    return mapping;
  }

  let wildcardEndIndex = -1;
  for (let i = 0; i < pathSpec.length; i++) {
    const spec = pathSpec[pathSpec.length - i - 1]!;
    if (spec.type === 'wildcard') {
      wildcardEndIndex = actual.length - i - 1;
      break;
    }
    if (!matchSpecSegment(spec, actual[actual.length - i - 1], mapping)) {
      return null;
    }
  }
  const wildcardName = pathSpec[wildcardStartIndex]!.name;
  if (wildcardName) {
    mapping[wildcardName] = actual.slice(
      wildcardStartIndex,
      wildcardEndIndex + 1,
    );
  }
  return mapping;
};
