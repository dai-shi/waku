import { defineRouter } from 'waku/router/server';

export default defineRouter(
  // getComponent (id is "**/layout" or "**/page")
  async (id) => {
    switch (id) {
      case 'page':
        return import('./routes/page.js');
      case 'blog/introducing-waku/page':
        return import('./routes/blog/introducing-waku/page.js');
      default:
        return null;
    }
  },
  // getPathsForBuild
  async () => {
    return ['/', '/blog/introducing-waku'];
  },
);
