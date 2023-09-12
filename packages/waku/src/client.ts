/// <reference types="react/canary" />

"use client";

import {
  cache,
  createContext,
  createElement,
  memo,
  use,
  useCallback,
  useState,
  startTransition,
} from "react";
import type { ReactNode } from "react";
import RSDWClient from "react-server-dom-webpack/client";

const { createFromFetch, encodeReply } = RSDWClient;

const checkStatus = async (
  responsePromise: Promise<Response>,
): Promise<Response> => {
  const response = await responsePromise;
  if (!response.ok) {
    const err = new Error(response.statusText);
    (err as any).statusCode = response.status;
    throw err;
  }
  return response;
};

type Elements = Promise<Record<string, ReactNode>>;

const mergeElements = cache(
  async (a: Elements, b: Elements | Awaited<Elements>): Elements => {
    const nextElements = { ...(await a), ...(await b) };
    delete nextElements._value;
    return nextElements;
  },
);

// TODO get basePath from vite config

export const fetchRSC = cache(
  (
    input: string,
    rerender: (fn: (prev: Elements) => Elements) => void,
    basePath = "/RSC/",
  ): Elements => {
    const options = {
      async callServer(actionId: string, args: unknown[]) {
        const response = fetch(basePath + encodeURIComponent(actionId), {
          method: "POST",
          body: await encodeReply(args),
        });
        const data = createFromFetch(checkStatus(response), options);
        startTransition(() => {
          // FIXME this causes rerenders even if data is empty
          rerender((prev) => mergeElements(prev, data));
        });
        return (await data)._value;
      },
    };
    const prefetched = ((globalThis as any).__WAKU_PREFETCHED__ ||= {});
    const response =
      prefetched[input] || fetch(basePath + (input || "__DEFAULT__"));
    delete prefetched[input];
    const data = createFromFetch(checkStatus(response), options);
    return data;
  },
);

const RefetchContext = createContext<((input: string) => void) | null>(null);
const ElementsContext = createContext<Elements | null>(null);

// HACK there should be a better way...
const createRerender = cache(() => {
  let rerender: ((fn: (prev: Elements) => Elements) => void) | undefined;
  const stableRerender = (fn: Parameters<NonNullable<typeof rerender>>[0]) => {
    rerender?.(fn);
  };
  const getRerender = () => stableRerender;
  const setRerender = (newRerender: NonNullable<typeof rerender>) => {
    rerender = newRerender;
  };
  return [getRerender, setRerender] as const;
});

export const Root = ({
  initialInput,
  children,
  basePath,
}: {
  initialInput?: string;
  children: ReactNode;
  basePath?: string;
}) => {
  const [getRerender, setRerender] = createRerender();
  const [elements, setElements] = useState(() =>
    fetchRSC(initialInput || "", getRerender(), basePath),
  );
  setRerender(setElements);
  const refetch = useCallback(
    (input: string) => {
      const data = fetchRSC(input, getRerender(), basePath);
      setElements((prev) => mergeElements(prev, data));
    },
    [getRerender, basePath],
  );
  return createElement(
    RefetchContext.Provider,
    { value: refetch },
    createElement(ElementsContext.Provider, { value: elements }, children),
  );
};

export const useRefetch = () => {
  const refetch = use(RefetchContext);
  if (!refetch) {
    throw new Error("Missing Root component");
  }
  return refetch;
};

const ChildrenContext = createContext<ReactNode>(undefined);
const ChildrenContextProvider = memo(ChildrenContext.Provider);

export const Slot = ({
  id,
  children,
}: {
  id: string;
  children?: ReactNode;
}) => {
  const elementsPromise = use(ElementsContext);
  if (!elementsPromise) {
    throw new Error("Missing Root component");
  }
  const elements = use(elementsPromise);
  if (!(id in elements)) {
    throw new Error("Not found: " + id);
  }
  return createElement(
    ChildrenContextProvider,
    { value: children },
    elements[id],
  );
};

export const Children = () => use(ChildrenContext);
