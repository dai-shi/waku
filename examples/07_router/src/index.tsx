import { StrictMode } from "react";
import {
  // createRoot,
  hydrateRoot,
} from "react-dom/client";
import { hydrationOptions } from "waku/client";
import { Router } from "waku/router/client";

import { ErrorBoundary } from "./ErrorBoundary.js";

const rootElement = (
  <StrictMode>
    <ErrorBoundary fallback={(error) => <h1>{String(error)}</h1>}>
      <Router />
    </ErrorBoundary>
  </StrictMode>
);

// createRoot(document.getElementById("root")!).render(rootElement);
hydrateRoot(document.getElementById("root")!, rootElement, hydrationOptions);
