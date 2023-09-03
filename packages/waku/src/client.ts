/// <reference types="react/canary" />

import { cache, createContext, createElement, use, useState } from "react";
import type { ReactNode } from "react";
import { createFromFetch, encodeReply } from "react-server-dom-webpack/client";

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
        const data = await createFromFetch(checkStatus(response), options);
        const { _value: value, ...updatedElements } = data;
        if (Object.keys(updatedElements).length > 0) {
          rerender((prev) =>
            prev.then((resolvedPrev) => ({
              ...resolvedPrev,
              ...updatedElements,
            })),
          );
        }
        return value;
      },
    };
    const prefetched = (globalThis as any).__WAKU_PREFETCHED__?.[input];
    const response = prefetched || fetch(basePath + input);
    const data = createFromFetch(checkStatus(response), options);
    return data;
  },
);

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
  initialInput: string;
  children: ReactNode;
  basePath?: string;
}) => {
  const [getRerender, setRerender] = createRerender();
  const [elements, setElements] = useState(() =>
    fetchRSC(initialInput, getRerender(), basePath),
  );
  setRerender(setElements);
  return createElement(
    ElementsContext.Provider,
    { value: elements },
    children,
  );
};

export const Server = ({ id }: { id: string }) => {
  const elementsPromise = use(ElementsContext);
  if (!elementsPromise) {
    throw new Error("Missing Root component");
  }
  const elements = use(elementsPromise);
  if (!(id in elements)) {
    throw new Error("Not found: " + id);
  }
  return elements[id];
};
