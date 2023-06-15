/// <reference types="react/next" />

import { cache, use, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { createFromFetch, encodeReply } from "react-server-dom-webpack/client";

const checkStatus = async (
  responsePromise: Promise<Response>
): Promise<Response> => {
  const response = await responsePromise;
  if (!response.ok) {
    const err = new Error(response.statusText);
    (err as any).statusCode = response.status;
    throw err;
  }
  return response;
};

export function serve<Props>(rscId: string, basePath = "/RSC/") {
  type SetRerender = (
    rerender: (next: [ReactElement, string]) => void
  ) => () => void;
  const fetchRSC = cache(
    (serializedProps: string): readonly [ReactElement, SetRerender] => {
      let rerender: ((next: [ReactElement, string]) => void) | undefined;
      const setRerender: SetRerender = (fn) => {
        rerender = fn;
        return () => {
          rerender = undefined;
        };
      };
      const searchParams = new URLSearchParams();
      searchParams.set("props", serializedProps);
      const options = {
        async callServer(rsfId: string, args: unknown[]) {
          const isMutating = !!mutationMode;
          const searchParams = new URLSearchParams();
          searchParams.set("action_id", rsfId);
          let id: string;
          if (isMutating) {
            id = rscId;
            searchParams.set("props", serializedProps);
          } else {
            id = "_";
          }
          const response = fetch(basePath + id + "/" + searchParams, {
            method: "POST",
            body: await encodeReply(args),
          });
          const data = createFromFetch(checkStatus(response), options);
          if (isMutating) {
            rerender?.([data, serializedProps]);
          }
          return data;
        },
      };
      const prefetched = (globalThis as any).__WAKU_PREFETCHED__?.[rscId]?.[
        serializedProps
      ];
      const response =
        prefetched || fetch(basePath + rscId + "/" + searchParams);
      const data = createFromFetch(checkStatus(response), options);
      return [data, setRerender];
    }
  );
  const ServerComponent = (props: Props) => {
    if (!props) {
      console.warn("Something went wrong. Please refresh your browser.");
      return;
    }
    // FIXME we blindly expect JSON.stringify usage is deterministic
    const serializedProps = JSON.stringify(props);
    const [data, setRerender] = fetchRSC(serializedProps);
    const [state, setState] = useState<
      [dataToOverride: ReactElement, lastSerializedProps: string] | undefined
    >();
    // XXX Should this be useLayoutEffect?
    useEffect(() => setRerender(setState));
    let dataToReturn = data;
    if (state) {
      if (state[1] === serializedProps) {
        dataToReturn = state[0];
      } else {
        setState(undefined);
      }
    }
    // FIXME The type error
    // "Cannot read properties of null (reading 'alternate')"
    // is caused with startTransition.
    // Not sure if it's a React bug or our misusage.
    // For now, using `use` seems to fix it. Is it a correct fix?
    return use(dataToReturn as any) as typeof dataToReturn;
  };
  return ServerComponent;
}

let mutationMode = 0;

export function mutate(fn: () => void) {
  ++mutationMode;
  fn();
  --mutationMode;
}
