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

type Elements = Record<string, ReactNode>;

const Context = createContext<Elements | null>(null);

// TODO get basePath from vite config

export function serve(basePath = "/RSC/") {
  const fetchRSC = cache((
    input: string,
    rerender: (fn: (prev: Elements) => Elements) => void,
  ): Elements => {
    const options = {
      async callServer(actionId: string, args: unknown[]) {
        const response = fetch(basePath + actionId, {
          method: "POST",
          body: await encodeReply(args),
        });
        const data = createFromFetch(checkStatus(response), options);
        const { _value: value, ...updatedElements } = data;
        rerender((prev) => ({ ...prev, updatedElements }));
        return value;
      },
    };
    const prefetched = (globalThis as any).__WAKU_PREFETCHED__?.[input];
    const response = prefetched || fetch(basePath + input);
    const data = createFromFetch(checkStatus(response), options);
    return data;
  });

  const Root = ({
    initialInput,
    children,
  }: {
    initialInput: string;
    children: ReactNode;
  }) => {
    const [elements, setElements] = useState(
      (): Elements => fetchRSC(initialInput, setElements),
    );
    return createElement(
      Context.Provider,
      {
        value: use(elements as any) as typeof elements,
      },
      children,
    );
  };

  const Server = ({ id }: { id: string }) => {
    const elements = use(Context);
    if (!elements) {
      throw new Error("Missing Root component");
    }
    if (!(id in elements)) {
      throw new Error("Not found: " + id);
    }
    return elements[id];
  };

  return { Root, Server };
}
