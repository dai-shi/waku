import { jsx as _jsx } from "react/jsx-runtime";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { serve } from "waku/client";
const App = serve("App");
const rootElement = (_jsx(StrictMode, { children: _jsx(App, { name: "Waku" }) }));
createRoot(document.getElementById("root")).render(rootElement);
