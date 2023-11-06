import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { Root, Slot } from "waku/client";

const rootElement = (
  <StrictMode>
    <Root>
      <Slot id="App">
        <h3>A client element</h3>
      </Slot>
    </Root>
  </StrictMode>
);

if ((globalThis as any).__WAKU_SSR_ENABLED__) {
  hydrateRoot(document.getElementById("root")!, rootElement);
} else {
  createRoot(document.getElementById("root")!).render(rootElement);
}
