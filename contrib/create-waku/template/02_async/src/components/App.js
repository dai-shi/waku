import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Suspense } from "react";
import { Counter } from "./Counter.js";
const App = ({ name = "Anonymous" }) => {
    return (_jsxs("div", { style: { border: "3px red dashed", margin: "1em", padding: "1em" }, children: [_jsxs("h1", { children: ["Hello ", name, "!!"] }), _jsx("h3", { children: "This is a server component." }), _jsx(Suspense, { fallback: "Pending...", children: _jsx(ServerMessage, {}) }), _jsx(Suspense, { fallback: _jsx(CounterSkeleton, {}), children: _jsx(Counter, {}) })] }));
};
const ServerMessage = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return _jsx("p", { children: "Hello from server!" });
};
const CounterSkeleton = () => {
    return (_jsxs("div", { style: { border: "3px blue dashed", margin: "1em", padding: "1em" }, children: [_jsxs("p", { children: ["Count: ", 0] }), _jsx("button", { disabled: true, children: "Increment" }), _jsx("h3", { children: "This is a skeleton component." })] }));
};
export default App;
