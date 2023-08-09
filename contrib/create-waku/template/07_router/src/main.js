import { jsx as _jsx } from "react/jsx-runtime";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Router } from "waku/router/client";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
const rootElement = (_jsx(StrictMode, { children: _jsx(ErrorBoundary, { fallback: (error) => _jsx("h1", { children: String(error) }), children: _jsx(Router, {}) }) }));
createRoot(document.getElementById("root")).render(rootElement);
