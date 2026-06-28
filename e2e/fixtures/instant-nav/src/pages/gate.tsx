import { unstable_redirect as redirect } from 'waku/router/server';

let visits = 0;

export default async function Gate() {
  // Test-only server state: serve the page on the first render (so the route
  // gets cached), then redirect on a later one, to exercise the optimistic
  // commit reconciling a cached route that turns out to redirect.
  // eslint-disable-next-line react-hooks/globals
  visits += 1;
  if (visits > 1) {
    redirect('/post/2');
  }
  return <div data-testid="gate">Gate</div>;
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
