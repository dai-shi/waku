import { trimTrailingSlash } from 'hono/trailing-slash';

export default () => trimTrailingSlash({ alwaysRedirect: true });

// Usage of appendTrailingSlash
/*
import { appendTrailingSlash } from 'hono/trailing-slash';

export default () =>
  appendTrailingSlash({
    alwaysRedirect: true,
    skip: (path) => /\.\w+$/.test(path),
  });
*/
