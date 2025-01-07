import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';

export default defineEntries({
  handleRequest: async (input, { renderRsc }) => {
    if (input.type === 'function') {
      const value = await input.fn(...input.args);
      return renderRsc({ _value: value });
    }
  },
  handleBuild: () => null,
});
