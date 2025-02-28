/** Remove (group)s from path. Like /(group)/foo => /foo */
export const getGrouplessPath = (path: string) => {
  if (path.includes('(')) {
    const withoutGroups = path
      .split('/')
      .filter((part) => !part.startsWith('('));
    path = withoutGroups.length > 1 ? withoutGroups.join('/') : '/';
  }
  return path;
};
