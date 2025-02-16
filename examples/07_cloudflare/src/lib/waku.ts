import { unstable_getBuildOptions } from 'waku/server';

export function isBuild() {
  return !!unstable_getBuildOptions().unstable_phase;
}
