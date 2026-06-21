import { trimTrailingSlash } from 'hono/trailing-slash';

export default () => trimTrailingSlash({ alwaysRedirect: true });
