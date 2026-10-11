import { unstable_redirect as redirect } from 'waku/router/server';
import { searchRoute } from '../lib/routes';

export default function RedirectToSearchPage() {
  return redirect(searchRoute({ search: { q: 'hi', page: 2 } }));
}
