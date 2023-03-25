import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { serve } from "wakuwork/client";

const root = createRoot(document.getElementById("root")!);

const App = serve<{ name: string }>("App");
root.render(
  <StrictMode>
    <App name="Wakuwork" />
  </StrictMode>
);
