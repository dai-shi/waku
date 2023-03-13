import type { ReactNode } from "react";
import RSDWClient from "react-server-dom-webpack/client";

const { createFromFetch } = RSDWClient;

export function serve<Props>(rscId: string, render: (ele: ReactNode) => void) {
  return async (props: Props) => {
    const serializedProps = JSON.stringify(props);
    const searchParams = new URLSearchParams();
    searchParams.set("rsc_id", rscId);
    searchParams.set("props", serializedProps);
    const options = {
      callServer(rsfId: string, args: unknown[]) {
        const searchParams = new URLSearchParams();
        searchParams.set("rsf_id", rsfId);
        if (isMutating) {
          searchParams.set("rsc_id", rscId);
          searchParams.set("props", serializedProps);
        }
        const response = fetch(`/?${searchParams}`, {
          method: "POST",
          body: JSON.stringify(args),
        });
        const data = createFromFetch(response, options);
        if (isMutating) {
          data.then((value: unknown) => {
            render(value as ReactNode);
          });
        }
        return data;
      },
    };
    const ele: ReactNode = await createFromFetch(
      fetch(`/?${searchParams}`),
      options
    );
    render(ele);
  };
}

let isMutating = 0;

export function mutate<Fn extends (...args: any[]) => any>(fn: Fn): Fn {
  return ((...args: unknown[]) => {
    ++isMutating;
    const result = fn(...args);
    --isMutating;
    return result;
  }) as Fn;
}
