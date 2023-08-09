import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Counter } from "./Counter.js";
const InnerApp = ({ count = -1 }) => {
    return (_jsxs("div", { style: { border: "3px red dashed", margin: "1em", padding: "1em" }, children: [_jsx("h3", { children: "This is another server component." }), _jsxs("p", { children: ["The outer count is ", count, "."] }), _jsx(Counter, {})] }));
};
export default InnerApp;
