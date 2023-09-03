import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Root, Server } from "waku/client";

const rootElement = (
  <StrictMode>
    <Root initialInput="Waku">
      <Server id="App" />
    </Root>
  </StrictMode>
);

createRoot(document.getElementById("root")!).render(rootElement);
