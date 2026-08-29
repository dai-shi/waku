'use client';

import {
  Component,
  createContext,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE as useMergeElements,
} from 'waku/minimal/client';
import {
  type Unstable_FollowDecision as FollowDecision,
  unstable_MAX_FOLLOWS_PER_NAVIGATION as MAX_FOLLOWS_PER_NAVIGATION,
  unstable_ROUTE_ID as ROUTE_ID,
  type Unstable_RouteProps as RouteProps,
  type Unstable_RouterHost as RouterHost,
  RouterHostContext_UNSTABLE as RouterHostContext,
  unstable_buildMergePatch as buildMergePatch,
  unstable_decideFollow as decideFollow,
  unstable_encodeRoutePath as encodeRoutePath,
  unstable_getRouteFromElements as getRouteFromElements,
  unstable_getRouteSlotId as getRouteSlotId,
  unstable_getRouteUrl as getRouteUrl,
  unstable_has404FromElements as has404FromElements,
  unstable_isFollowable as isFollowable,
  unstable_learnStaticFromElements as learnStaticFromElements,
  unstable_load as load,
  unstable_parseRoute as parseRoute,
  unstable_prefetchRoute as prefetchRoute,
  useInitialRoute_UNSTABLE as useInitialRoute,
  useInitialRscParams_UNSTABLE as useInitialRscParams,
} from 'waku/router/client-core';
import { settleNavigateFinished } from './settle-navigate-finished.js';

type FollowRun = (
  next: RouteProps,
  signal: AbortSignal,
  follows: number,
) => Promise<void>;

type LastFollow = { href: string; follows: number };

type FollowHost = {
  ownsNavigation: boolean;
  follows: number;
  setFollows: (n: number | ((n: number) => number)) => void;
  lastFollowRef: { current: LastFollow | null };
  runRef: { current: FollowRun };
};

const FollowHostContext = createContext<FollowHost | null>(null);

const subscribeNever = () => () => {};
const getClientTrue = () => true;
const getServerFalse = () => false;

const FollowRedirect = ({
  decision,
}: {
  decision: Extract<FollowDecision, { type: 'follow' | 'leave' }>;
}) => {
  const { ownsNavigation, follows, setFollows, lastFollowRef, runRef } =
    use(FollowHostContext)!;
  const href = decision.url.href;
  // a second navigate() to the same href while intercept is in-flight hangs.
  // Strict Mode remounts this effect at the same captured count; a later slot
  // visit after a load-time hop does not. setFollows re-renders with
  // follows+1 — still this dispatch — so the event reads follows without
  // listing it as a dependency.
  const startFollow = useEffectEvent(() => {
    const last = lastFollowRef.current;
    if (last && last.href === href && last.follows === follows) {
      return;
    }
    lastFollowRef.current = { href, follows };
    const nextFollows = follows + 1;
    setFollows(nextFollows);
    if (ownsNavigation) {
      void window.navigation.navigate(href, {
        history: 'replace',
        state: { follows: nextFollows },
        info: { scroll: false, follows: nextFollows },
      });
      return;
    }
    void runRef.current(
      parseRoute(new URL(href, window.location.href)),
      new AbortController().signal,
      nextFollows,
    );
  });
  useEffect(() => {
    if (decision.type === 'leave') {
      window.location.replace(href);
      return;
    }
    startFollow();
  }, [decision.type, href]);
  return null;
};

// slot-thrown stop/none must leave this boundary so the fallback can render
class FollowFailure extends Component<
  { children: ReactNode },
  { error: unknown | null }
> {
  state: { error: unknown | null } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (error !== null) {
      const message = error instanceof Error ? error.message : String(error);
      return <p data-testid="follow-error">{message}</p>;
    }
    return this.props.children;
  }
}

// the fetch can succeed with the throwing page still in the payload.
// path changes remount via key; query/hash follows clear the held error in
// place — remounting on query would rebuild the page on every setSearch.
// a hash-only slot redirect cannot be resolved (no refetch); decideFollow
// must stop it as a loop after the address bar moves.
class FollowBoundary extends Component<
  {
    routeKey: string;
    route: RouteProps;
    has404: boolean;
    follows: number;
    children: ReactNode;
  },
  { error: unknown | null; routeKey: string }
> {
  state: { error: unknown | null; routeKey: string } = {
    error: null,
    routeKey: this.props.routeKey,
  };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  static getDerivedStateFromProps(
    props: { routeKey: string },
    state: { routeKey: string },
  ) {
    return props.routeKey !== state.routeKey
      ? { error: null, routeKey: props.routeKey }
      : null;
  }
  render() {
    const { error } = this.state;
    if (error !== null) {
      if (!isFollowable(error)) {
        throw error;
      }
      const { route, has404, follows } = this.props;
      const decision = decideFollow(
        error,
        {
          route,
          url: getRouteUrl(route),
          follows,
        },
        { has404, maxFollows: MAX_FOLLOWS_PER_NAVIGATION },
      );
      if (decision.type === 'stop' || decision.type === 'none') {
        throw decision.type === 'stop' ? decision.error : error;
      }
      return <FollowRedirect decision={decision} />;
    }
    return this.props.children;
  }
}

const NavBinding = ({ fallbackRoute }: { fallbackRoute: RouteProps }) => {
  const { ownsNavigation, follows, setFollows, lastFollowRef, runRef } =
    use(FollowHostContext)!;
  const elements = use(useElementsPromise());
  const mergeElements = useMergeElements();
  const routeFallback = useInitialRoute(fallbackRoute);
  const resolvedRef = useRef(elements);
  useLayoutEffect(() => {
    resolvedRef.current = elements;
  }, [elements]);
  const has404 = has404FromElements(elements);
  // hash-only navigations skip load; the host still has to report the current hash
  const [hash, setHash] = useState('');
  useEffect(() => {
    if (!ownsNavigation) {
      return;
    }
    const navigation = window.navigation;
    if (!navigation) {
      return;
    }
    const sync = () => setHash(window.location.hash);
    sync();
    navigation.addEventListener('currententrychange', sync);
    return () => navigation.removeEventListener('currententrychange', sync);
  }, [ownsNavigation]);
  const route = useMemo((): RouteProps => {
    const fromElements = getRouteFromElements(elements);
    return fromElements ? { ...fromElements, hash } : routeFallback;
  }, [elements, routeFallback, hash]);

  const runImpl: FollowRun = async (next, signal, followCount) => {
    const base = resolvedRef.current;
    const settled = getRouteFromElements(base) ?? routeFallback;
    const outcome = await load(next, {
      signal,
      has404,
      settled,
      base,
      follows: followCount,
    });
    if (outcome.type === 'aborted') {
      return;
    }
    if (outcome.type === 'external') {
      window.location.replace(outcome.url.href);
      throw outcome.error;
    }
    if (outcome.type === 'failed') {
      throw outcome.error;
    }
    // slot follows already incremented the host; a later slot must resume
    // from load-time hops too or the mixed chain under-counts
    if (outcome.type === 'reused' || outcome.type === 'loaded') {
      setFollows(outcome.follows);
    }
    // intercept already committed the requested URL; a load-time follow
    // that landed elsewhere still has to rewrite this entry
    if (
      ownsNavigation &&
      outcome.url.href !== window.location.href &&
      outcome.url.href !== getRouteUrl(next).href
    ) {
      window.history.replaceState(null, '', outcome.url.href);
    }
    if (outcome.type === 'reused') {
      await mergeElements({
        [ROUTE_ID]: [outcome.route.path, outcome.route.query],
      });
      return;
    }
    const patch = buildMergePatch(
      { route: outcome.route, elements: outcome.elements },
      resolvedRef.current,
      base,
      { settled },
    );
    await mergeElements(patch);
    learnStaticFromElements(outcome.elements);
  };

  useLayoutEffect(() => {
    runRef.current = runImpl;
  });

  const run = useEffectEvent(runImpl);

  useEffect(() => {
    if (!ownsNavigation) {
      return;
    }
    const navigation = window.navigation;
    if (!navigation) {
      return;
    }
    const onNavigate = (event: NavigateEvent) => {
      if (!event.canIntercept || event.downloadRequest) {
        return;
      }
      const dest = new URL(event.destination.url);
      if (dest.origin !== window.location.origin) {
        return;
      }
      const info = event.info as
        { scroll?: boolean; follows?: number } | undefined;
      // replace is not "redirect"; only our follow metadata continues a chain.
      // a hash-only user navigation never loads, but it is still a fresh chain.
      if (typeof info?.follows === 'number') {
        setFollows(info.follows);
      } else {
        setFollows(0);
        lastFollowRef.current = null;
      }
      const next = parseRoute(dest);
      const current = parseRoute(new URL(window.location.href));
      if (next.path === current.path && next.query === current.query) {
        return;
      }
      event.intercept({
        handler: () =>
          run(
            next,
            event.signal,
            typeof info?.follows === 'number' ? info.follows : 0,
          ),
        // useSetSearch passes scroll: false; intercept defaults to after-transition
        ...(info?.scroll === false ? { scroll: 'manual' } : {}),
      });
    };
    navigation.addEventListener('navigate', onNavigate);
    prefetchRoute({ path: '/hello/spike', query: '', hash: '' });
    return () => navigation.removeEventListener('navigate', onNavigate);
  }, [lastFollowRef, ownsNavigation, setFollows]);

  const navigate = useCallback<RouterHost['navigate']>((href, opts) => {
    const result = window.navigation.navigate(href, {
      history: opts.history,
      info: { scroll: opts.scroll },
    });
    return settleNavigateFinished(result.finished);
  }, []);
  const host = useMemo(
    (): RouterHost => ({ route, navigate }),
    [route, navigate],
  );

  const routeSlot = (
    <FollowFailure key={route.path}>
      <FollowBoundary
        key={route.path}
        routeKey={`${route.path}\0${route.query}\0${route.hash}`}
        route={route}
        has404={has404}
        follows={follows}
      >
        <Slot id={getRouteSlotId(route.path)} />
      </FollowBoundary>
    </FollowFailure>
  );

  return (
    <RouterHostContext value={host}>
      {ownsNavigation ? <Slot id="root">{routeSlot}</Slot> : routeSlot}
    </RouterHostContext>
  );
};

export const NavRouter = ({
  ownsNavigation = true,
  initialRoute,
}: {
  ownsNavigation?: boolean;
  initialRoute?: RouteProps;
} = {}) => {
  // NavBinding remounts on every merge; this host does not. Entry state is
  // not instance-scoped (`window.navigation` is per document) and intercept
  // runs before the URL commits.
  const [follows, setFollows] = useState(0);
  const lastFollowRef = useRef<LastFollow | null>(null);
  const runRef = useRef<FollowRun>(async () => {});
  const followHost = useMemo(
    (): FollowHost => ({
      ownsNavigation,
      follows,
      setFollows,
      lastFollowRef,
      runRef,
    }),
    [follows, ownsNavigation],
  );
  const [fallback] = useState(
    () => initialRoute ?? parseRoute(new URL(window.location.href)),
  );
  // bounce as an inner initial RSC would HTTP-redirect the document and
  // consume the outer __WAKU_INITIAL_RSC__ payload
  const isClient = useSyncExternalStore(
    subscribeNever,
    getClientTrue,
    getServerFalse,
  );
  const ready = ownsNavigation || isClient;
  const initialRscPath = encodeRoutePath(fallback.path);
  const initialRscParams = useInitialRscParams(initialRscPath, fallback.query);
  if (!ready) {
    return null;
  }
  return (
    <FollowHostContext value={followHost}>
      {ownsNavigation ? null : <p data-testid="follow-count">{follows}</p>}
      <Root initialRscPath={initialRscPath} initialRscParams={initialRscParams}>
        <NavBinding fallbackRoute={fallback} />
      </Root>
    </FollowHostContext>
  );
};

export const OwningFollowCount = () => {
  const host = use(FollowHostContext);
  return <p data-testid="owning-follow-count">{host?.follows ?? 0}</p>;
};
