import { isValidElement } from "react";
import type { ReactNode } from "react";
import RSDWClient from "react-server-dom-webpack/client";

const { createFromFetch } = RSDWClient;

export function serve<Props>(rscId: string, render: (ele: ReactNode) => void) {
  return async (props: Props) => {
    const searchParams = new URLSearchParams();
    searchParams.set("rsc_id", rscId);
    searchParams.set("props", JSON.stringify(props));
    const ele: ReactNode = await createFromFetch(fetch(`/?${searchParams}`), {
      callServer(rsfId: string, args: unknown[]) {
        const searchParams = new URLSearchParams();
        searchParams.set("rsc_id", rscId);
        searchParams.set("rsf_id", rsfId);
        const response = fetch(`/?${searchParams}`, {
          method: "POST",
          body: JSON.stringify(args),
        });
        const data = createFromFetch(response);
        data.then((value: unknown) => {
          // TODO should we check it more explicitly?
          if (isValidElement(value)) {
            render(value);
          }
        });
        return data;
      },
    });
    render(ele);
  };
}
