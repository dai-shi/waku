import type { Plugin, PluginOption } from 'vite';

export const patchReactRefresh = <T extends PluginOption[]>(options: T): T =>
  options.map((option) => {
    const plugin = option as Plugin;
    const origTransformIndexHtml = plugin?.transformIndexHtml;
    if (
      plugin?.name === 'vite:react-refresh' &&
      typeof origTransformIndexHtml === 'function'
    ) {
      return {
        ...option,
        transformIndexHtml(...args) {
          const result = origTransformIndexHtml(...args);
          if (Array.isArray(result)) {
            return result.map((item) => ({
              ...item,
              attrs: { ...item.attrs, async: true },
            }));
          }
          return result;
        },
      };
    }
    return option;
  }) as T;
