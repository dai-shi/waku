import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { FUNCTION_RESULT } from 'waku/config';

export default defineEntries({
  handleRequest: async (input, { renderRsc }) => {
    if (input.type === 'function') {
      const value = await input.fn(...input.args);
      return renderRsc({ [FUNCTION_RESULT]: value });
    }
  },
  handleBuild: () => null,
});
