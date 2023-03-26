/// <reference types="react/next" />

import { cache, useEffect, useState } from "react";
import type { ReactNode, ReactElement } from "react";
import RSDWClient from "react-server-dom-webpack/client";

const { createFromFetch, encodeReply } = RSDWClient;

// FIXME only works with basePath="/"
const basePath = "/";

export function serve<Props>(rscId: string) {
  type SetRerender = (rerender: (next: ReactNode) => void) => () => void;
  const fetchRSC = cache(
    (serializedProps: string): readonly [ReactNode, SetRerender] => {
      let rerender: ((next: ReactNode) => void) | undefined;
      const searchParams = new URLSearchParams();
      searchParams.set("rsc_id", rscId);
      searchParams.set("props", serializedProps);
      const options = {
        async callServer(rsfId: string, args: unknown[]) {
          const isMutating = !!mutationMode;
          const searchParams = new URLSearchParams();
          searchParams.set("rsf_id", rsfId);
          if (isMutating) {
            searchParams.set("rsc_id", rscId);
            searchParams.set("props", serializedProps);
          }
          const response = fetch(basePath + "?" + searchParams, {
            method: "POST",
            body: await encodeReply(args),
          });
          const data = createFromFetch(response, options);
          if (isMutating) {
            rerender?.(data);
          }
          return data;
        },
      };
      const prefetched = (globalThis as any).__WAKUWORK_PREFETCHED__?.[rscId]?.[
        serializedProps
      ];
      const data = createFromFetch(
        prefetched || fetch(basePath + "?" + searchParams),
        options
      );
      const setRerender: SetRerender = (fn) => {
        rerender = fn;
        return () => {
          rerender = undefined;
        };
      };
      return [data, setRerender];
    }
  );
  const ServerComponent = (props: Props) => {
    // FIXME we blindly expect JSON.stringify usage is deterministic
    const serializedProps = JSON.stringify(props);
    const [
      [currentNode, currentSetRerender, currentSerializedProps],
      setState,
    ] = useState<readonly [ReactNode, SetRerender, string]>(() => [
      ...fetchRSC(serializedProps),
      serializedProps,
    ]);
    if (currentSerializedProps !== serializedProps) {
      setState([...fetchRSC(serializedProps), serializedProps]);
    }
    // XXX Should this be useLayoutEffect?
    useEffect(() =>
      currentSetRerender((nextNode) =>
        setState([nextNode, currentSetRerender, serializedProps])
      )
    );
    return currentNode as ReactElement; // HACK type FIXME
  };
  return ServerComponent;
}

let mutationMode = 0;

export function mutate(fn: () => void) {
  ++mutationMode;
  fn();
  --mutationMode;
}
