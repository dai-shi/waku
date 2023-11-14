import type { LoadHook } from 'node:module';

export const load: LoadHook = async (url, context, nextLoad) => {
  const result = await nextLoad(url, context);
  if (result.format === 'module') {
    let { source } = result;
    if (source && typeof source !== 'string') {
      source = source.toString();
      return { ...result, source };
    }
  }
  return result;
};
