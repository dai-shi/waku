import adapter from 'waku/adapters/default';

export default adapter({
  handleRequest: async (input, { renderRsc, renderHtmlFallback }) => {
    if (input.type === 'call') {
      const value = await input.fn(...input.args);
      return renderRsc({}, { value });
    }
    if (input.type === 'http' && input.pathname === '/bootstrap') {
      return renderHtmlFallback({
        unstable_extraScriptContent:
          'sessionStorage.setItem("bootstrap", "request");',
      });
    }
    return 'fallback';
  },
  handleBuild: async ({ generateDefaultHtml }) => {
    await generateDefaultHtml('index.html');
    await generateDefaultHtml('bootstrap.html', {
      unstable_extraScriptContent:
        'sessionStorage.setItem("bootstrap", "build");',
    });
  },
});
