import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ClientRouter } from "./lib/client.js";
import { routeTree } from "./routes.js";

const rootElement = (
  <StrictMode>
    <ClientRouter rootTree={routeTree} />
  </StrictMode>
);

createRoot(document.getElementById("root")!).render(rootElement);
