import adapter from 'waku/adapters/default';

export default adapter({
  handleRequest: async (input, { renderRsc }) => {
    if (input.type === 'call') {
      const value = await input.fn(...input.args);
      return renderRsc({}, { value });
    }
    return 'fallback';
  },
  handleBuild: async ({ generateDefaultHtml }) => {
    await generateDefaultHtml('index.html');
  },
});
