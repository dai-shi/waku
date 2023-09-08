import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Root, Slot } from "waku/client";

const rootElement = (
  <StrictMode>
    <Root initialInput="App=Waku&InnerApp=0">
      <Slot id="App" />
    </Root>
  </StrictMode>
);

createRoot(document.getElementById("root")!).render(rootElement);
