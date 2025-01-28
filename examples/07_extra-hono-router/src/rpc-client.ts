import { hc } from 'hono/client';
import { AppType } from './pages/api/hono/[...all]';

export const client = hc<AppType>('/');
