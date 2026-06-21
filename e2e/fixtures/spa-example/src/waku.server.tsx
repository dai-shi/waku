import adapter from 'waku/adapters/default';

export default adapter({
  handleRequest: async () => {
    return 'fallback';
  },
  handleBuild: async ({ generateDefaultHtml }) => {
    await generateDefaultHtml('index.html');
  },
});
