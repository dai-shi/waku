const IGNORED_PATH_PARTS = new Set(['_components', '_hooks']);

/** Ignore paths like `_components` and `_hooks` in pages dir */
export const isIgnoredPath = (paths: string[]) =>
  paths.some((p) => IGNORED_PATH_PARTS.has(p));
