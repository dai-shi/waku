import { StrictMode } from "react";
import {
  createRoot,
  // hydrateRoot,
} from "react-dom/client";
import { serve } from "waku/client";

const App = serve<{ name: string }>("App");
const rootElement = (
  <StrictMode>
    <App name="Waku" />
  </StrictMode>
);

createRoot(document.getElementById("root")!).render(rootElement);
// hydrateRoot(document.getElementById("root")!, rootElement);
