import {
  Component,
  startTransition,
  use,
  useEffect,
  useEffectEvent,
  useRef,
} from 'react';
import type { ReactNode } from 'react';
import {
  unstable_getErrorInfo as getErrorInfo,
  useElementsPromise_UNSTABLE as useElementsPromise,
} from '../../minimal/client.js';
import { has404FromElements } from '../client-core-utils/element-meta.js';
import {
  MAX_FOLLOWS_PER_NAVIGATION,
  decideFollow,
  isFollowable,
} from '../client-core-utils/error-route.js';
import { parseRoute } from '../client-core-utils/route-url.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import { RouterContext } from './router-context.js';
import { getRouterState } from './router-state.js';
import type { RouterState } from './router-state.js';

const FollowError = ({
  error,
  reset,
  fail,
}: {
  error: unknown;
  reset: () => void;
  fail: (original: unknown, error: unknown) => void;
}) => {
  const router = use(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }
  const { route, changeRoute } = router;
  const elements = use(useElementsPromise());
  const routerState = getRouterState(elements);
  const has404 = has404FromElements(elements);
  const { path: routePath, query: routeQuery, hash: routeHash } = route;
  const caughtAtRef = useRef<readonly [string, string, string]>(undefined);
  caughtAtRef.current ??= [routePath, routeQuery, routeHash];
  const leftRef = useRef<string>(undefined);
  const dispatchedRef = useRef<
    | { route: RouteProps; url: string; from: RouterState | undefined }
    | undefined
  >(undefined);
  useEffect(() => {
    const [caughtPath, caughtQuery, caughtHash] = caughtAtRef.current!;
    // a route change means the followed slot is committed; safe to reset
    if (
      routePath !== caughtPath ||
      routeQuery !== caughtQuery ||
      routeHash !== caughtHash
    ) {
      reset();
      return;
    }
    const dispatched = dispatchedRef.current;
    if (dispatched && routerState && routerState !== dispatched.from) {
      const sameRequest =
        routerState.requested[0] === dispatched.route.path &&
        routerState.requested[1] === dispatched.route.query;
      const followCompleted = sameRequest
        ? dispatched.route.path === routePath
        : routerState.url === dispatched.url;
      if (followCompleted) {
        reset();
      } else {
        fail(error, new Error('detected a navigation loop', { cause: error }));
      }
    }
  }, [routePath, routeQuery, routeHash, routerState, reset, fail, error]);
  const followCaughtError = useEffectEvent(() => {
    // the requested url may not have reached the address bar yet
    const stateUrl = routerState
      ? new URL(routerState.url, window.location.href)
      : new URL(window.location.href);
    const requested = routerState?.requested;
    const caught = requested
      ? { path: requested[0], query: requested[1] }
      : parseRoute(stateUrl);
    const follows = routerState?.follows ?? 0;
    const decision = decideFollow(
      error,
      { route: caught, url: stateUrl, follows },
      {
        has404,
        maxFollows: MAX_FOLLOWS_PER_NAVIGATION,
      },
    );
    if (decision.type === 'none') {
      return;
    }
    if (decision.type === 'stop') {
      fail(error, decision.error);
      return;
    }
    if (decision.type === 'leave') {
      // every leave replaces, so a navigation that already wrote its url does
      // not stack an entry the reader never saw. An action leave drops the
      // page it was on, which a form post without javascript would have kept
      if (leftRef.current !== decision.url.href) {
        // dev replays the effect, and firefox cancels a navigation that is
        // replaced while the first is still in flight
        leftRef.current = decision.url.href;
        window.location.replace(decision.url.href);
      }
      return;
    }
    const { target, url } = decision;
    const nextFollows = follows + 1;
    dispatchedRef.current = {
      route: target,
      url: url.pathname + url.search + url.hash,
      from: routerState,
    };
    startTransition(() => {
      changeRoute(target, {
        shouldScroll: routerState
          ? routerState.scroll !== null
          : target.path !== caught.path,
        history: 'replace',
        url,
        refetch: true,
        follows: nextFollows,
      }).catch((err: unknown) => {
        const rejected = decideFollow(
          err,
          { route: target, url, follows: nextFollows },
          { has404, maxFollows: MAX_FOLLOWS_PER_NAVIGATION },
        );
        if (rejected.type !== 'leave') {
          fail(error, err);
        }
      });
    });
  });
  useEffect(() => {
    followCaughtError();
  }, [error, has404]);
  const info = getErrorInfo(error);
  return info?.status === 404 && !has404 ? <h1>Not Found</h1> : null;
};

export class RenderErrorHandler extends Component<
  { children?: ReactNode },
  { error: unknown | null }
> {
  constructor(props: { children?: ReactNode }) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
    this.fail = this.fail.bind(this);
  }
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  reset() {
    this.setState({ error: null });
  }
  // error is a wrapper: the original still carries a location and would follow
  fail(original: unknown, error: unknown) {
    this.setState((state) => (state.error === original ? { error } : null));
  }
  render() {
    const { error } = this.state;
    if (error !== null) {
      if (isFollowable(error)) {
        return (
          <FollowError error={error} reset={this.reset} fail={this.fail} />
        );
      }
      throw error;
    }
    return this.props.children;
  }
}
