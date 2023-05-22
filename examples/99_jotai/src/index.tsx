import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { serve } from "waku/client";

import { ClientProvider, useAtomValues } from "../lib/jotai-rsc/client.js";

const root = createRoot(document.getElementById("root")!);

const App = serve<{ name: string; atomValues: unknown }>("App");
const Main = () => {
  const atomValues = useAtomValues();
  return <App name="Waku" atomValues={atomValues} />;
};
root.render(
  <StrictMode>
    <ClientProvider>
      <Main />
    </ClientProvider>
  </StrictMode>
);
