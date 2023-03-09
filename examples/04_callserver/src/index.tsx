import { StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createFromFetch } from "react-server-dom-webpack/client";

const root = createRoot(document.getElementById("root")!);

createFromFetch(fetch("/RSC/App?name=Wakuwork"), {
  callServer(id: { id: string; name: string }, args: unknown[]) {
    const searchParams = new URLSearchParams();
    searchParams.set("id", id.id);
    searchParams.set("name", id.name);
    const response = fetch(`/RSF?${searchParams}`, {
      method: "POST",
      body: JSON.stringify(args),
    });
    return createFromFetch(response);
  },
}).then((ele: ReactNode) => {
  root.render(<StrictMode>{ele}</StrictMode>);
});
