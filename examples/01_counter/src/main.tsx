import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { serve } from "waku/client";

const { Root, Server } = serve();
const rootElement = (
  <StrictMode>
    <Root initialInput="Waku">
      <Server id="App" />
    </Root>
  </StrictMode>
);

createRoot(document.getElementById("root")!).render(rootElement);
