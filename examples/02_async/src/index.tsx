import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { server } from "wakuwork";

import App from "./App.tsx";

const root = createRoot(document.getElementById("root")!);

server(App)({ name: "Wakuwork" }).then((ele) => {
  root.render(<StrictMode>{ele}</StrictMode>);
});
