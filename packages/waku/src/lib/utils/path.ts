// Refs: https://github.com/rollup/plugins/blob/d49bbe8dc5ec41157de5787c72c858f73be107ff/packages/pluginutils/src/normalizePath.ts
export function normalizePath(filePath: string) {
  return filePath.split('\\').join('/');
}
