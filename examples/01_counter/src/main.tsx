import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { Root, Slot } from "waku/client";

const rootElement = (
  <StrictMode>
    <Root>
      <Slot id="App" />
    </Root>
  </StrictMode>
);

hydrateRoot(document.getElementById("root")!, rootElement);
