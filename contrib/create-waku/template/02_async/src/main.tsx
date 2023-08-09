import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { serve } from "waku/client";

const App = serve<{ name: string }>("App");
const rootElement = (
  <StrictMode>
    <App name="Waku" />
  </StrictMode>
);

hydrateRoot(document.getElementById("root")!, rootElement, {
  onRecoverableError(err) {
    if (
      err instanceof Error &&
      err.message.startsWith("Client-only component")
    ) {
      // ignore
      return;
    }
    console.error(err);
  },
});
