import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { serve } from "wakuwork";

const root = createRoot(document.getElementById("root")!);

serve('App')({ name: "Wakuwork" }).then((ele) => {
  root.render(<StrictMode>{ele}</StrictMode>);
});
