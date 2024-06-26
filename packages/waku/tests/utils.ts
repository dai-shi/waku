import type { LoggingFunction, RollupLog, RollupOptions } from 'rollup';
import { fileURLToPath } from 'node:url';

export const fixturesRoot = fileURLToPath(
  new URL('./fixtures', import.meta.url),
);

const onwarn = (warning: RollupLog, defaultHandler: LoggingFunction) => {
  if (
    warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
    /"use (client|server)"/.test(warning.message)
  ) {
    return;
  } else if (
    warning.code === 'SOURCEMAP_ERROR' &&
    warning.loc?.column === 0 &&
    warning.loc?.line === 1
  ) {
    return;
  }
  defaultHandler(warning);
};

export function getDefaultRollupOptions(): RollupOptions {
  return {
    onwarn,
    cache: false,
    watch: false,
  };
}

export function hiddenPathFromCode(cwd: string, code: string): string {
  return code.replace(new RegExp(cwd, 'g'), '<hidden>/');
}
