'use client';

import { Link } from 'waku/router/client';
import { fooRoute } from '../lib/routes.js';

export function SearchPage() {
  return <Link to={fooRoute({ search: { q: 'after' } })}>Search foo</Link>;
}
