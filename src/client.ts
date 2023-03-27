/// <reference types="react/next" />

import { cache, useEffect, useState } from "react";
import type { ReactElement } from "react";
import RSDWClient from "react-server-dom-webpack/client";

const { createFromFetch, encodeReply } = RSDWClient;

// FIXME only works with basePath="/"
const basePath = "/";

export function serve<Props>(rscId: string) {
  type SetRerender = (rerender: (next: ReactElement) => void) => () => void;
  const fetchRSC = cache(
    (serializedProps: string): readonly [ReactElement, SetRerender] => {
      let rerender: ((next: ReactElement) => void) | undefined;
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
          let rscPath = "RSC/";
          if (isMutating) {
            rscPath += rscId;
            searchParams.set("props", serializedProps);
          }
          const response = fetch(basePath + rscPath + "?" + searchParams, {
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
      const rscPath = "RSC/" + rscId;
      const data = createFromFetch(
        prefetched || fetch(basePath + rscPath + "?" + searchParams),
        options
      );
      return [data, setRerender];
    }
  );
  const ServerComponent = (props: Props) => {
    // FIXME we blindly expect JSON.stringify usage is deterministic
    const serializedProps = JSON.stringify(props);
    const [currProps, setCurrProps] = useState(serializedProps);
    const [mutationData, setMutationData] = useState<
      ReactElement | undefined
    >();
    if (currProps !== serializedProps) {
      setCurrProps(serializedProps);
      setMutationData(undefined);
    }
    const [data, setRerender] = fetchRSC(serializedProps);
    // XXX Should this be useLayoutEffect?
    useEffect(() => setRerender(setMutationData));
    return mutationData ?? data;
  };
  return ServerComponent;
}

let mutationMode = 0;

export function mutate(fn: () => void) {
  ++mutationMode;
  fn();
  --mutationMode;
}
