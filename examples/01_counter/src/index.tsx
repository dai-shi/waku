import { StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createFromFetch } from "react-server-dom-webpack/client";

const root = createRoot(document.getElementById("root")!);

createFromFetch(fetch("/src/App?__RSC&name=Wakuwork")).then(
  (ele: ReactNode) => {
    root.render(<StrictMode>{ele}</StrictMode>);
  }
);
