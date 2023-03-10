import { StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createFromFetch } from "react-server-dom-webpack/client";

const root = createRoot(document.getElementById("root")!);

createFromFetch(fetch("/RSC/App?name=Wakuwork")).then(
  (ele: ReactNode) => {
    root.render(<StrictMode>{ele}</StrictMode>);
  }
);
