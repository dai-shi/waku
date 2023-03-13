import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { serve } from "wakuwork/client";

const root = createRoot(document.getElementById("root")!);

serve("App", (ele) => {
  root.render(<StrictMode>{ele}</StrictMode>);
})({ name: "Wakuwork" });
