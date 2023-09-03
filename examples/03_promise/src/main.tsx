import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Root, Server } from "waku/client";

const rootElement = (
  <StrictMode>
    <Root initialInput="Waku">
      <Server id="App">
        <h3>A client element</h3>
      </Server>
    </Root>
  </StrictMode>
);

createRoot(document.getElementById("root")!).render(rootElement);
