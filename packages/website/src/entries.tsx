import { defineRouter } from 'waku/router/server';

const STATIC_PATHS = ['/', '/blog/introducing-waku'];

export default defineRouter(
  // existsPath
  async (path: string) => (STATIC_PATHS.includes(path) ? 'static' : null),
  // getComponent (id is "**/layout" or "**/page")
  async (id, unstable_setShouldSkip) => {
    unstable_setShouldSkip({}); // always skip if possible
    switch (id) {
      case 'layout':
        return import('./routes/layout.js');
      case 'page':
        return import('./routes/page.js');
      case 'blog/introducing-waku/page':
        return import('./routes/blog/introducing-waku/page.js');
      default:
        return null;
    }
  },
  // getPathsForBuild
  async () => STATIC_PATHS.map((path) => ({ path })),
);
