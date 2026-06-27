import { unstable_redirect as redirect } from 'waku/router/server';

export default function RedirectToSearchPage() {
  // Typed structured target: `search` is checked against /search's codec and
  // serialized server-side, exercising the server codec-instance registry.
  return redirect({ to: '/search', search: { q: 'hi', page: 2 } });
}
