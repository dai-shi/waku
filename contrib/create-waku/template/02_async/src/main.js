import { jsx as _jsx } from "react/jsx-runtime";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { serve } from "waku/client";
const App = serve("App");
const rootElement = (_jsx(StrictMode, { children: _jsx(App, { name: "Waku" }) }));
hydrateRoot(document.getElementById("root"), rootElement, {
    onRecoverableError(err) {
        if (err instanceof Error &&
            err.message.startsWith("Client-only component")) {
            // ignore
            return;
        }
        console.error(err);
    },
});
