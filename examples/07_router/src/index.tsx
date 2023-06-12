import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Router } from "waku/router/client";

import { ErrorBoundary } from "./ErrorBoundary.js";

const root = createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    <ErrorBoundary fallback={(error) => <h1>{String(error)}</h1>}>
      <Router />
    </ErrorBoundary>
  </StrictMode>
);
