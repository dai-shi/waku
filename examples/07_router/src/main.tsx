import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Router } from "waku/router/client";

import { ErrorBoundary } from "./components/ErrorBoundary.js";

const rootElement = (
  <StrictMode>
    <ErrorBoundary fallback={(error) => <h1>{String(error)}</h1>}>
      <Router shouldSkip={() => true} />
    </ErrorBoundary>
  </StrictMode>
);

createRoot(document.getElementById("root")!).render(rootElement);
