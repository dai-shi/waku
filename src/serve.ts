import type { FunctionComponent, ReactNode } from "react";
import RSDWClient from "react-server-dom-webpack/client";

import { componentToId } from "./register.js";

const { createFromFetch } = RSDWClient;

export function serve<Props>(component: FunctionComponent<Props>) {
  const id = componentToId(component as FunctionComponent);
  return async (props: Props) => {
    const searchParams = new URLSearchParams();
    searchParams.set("rsc_id", id);
    searchParams.set("props", JSON.stringify(props));
    const ele: ReactNode = await createFromFetch(fetch(`/?${searchParams}`), {
      callServer(id: string, args: unknown[]) {
        const searchParams = new URLSearchParams();
        searchParams.set("rsf_id", id);
        const response = fetch(`/?${searchParams}`, {
          method: "POST",
          body: JSON.stringify(args),
        });
        return createFromFetch(response);
      },
    });
    return ele;
  };
}
