import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Counter } from "../components/Counter.js";
const Nested = ({ children }) => (_jsxs("div", { children: [_jsx("h2", { children: "Nested" }), _jsx(Counter, {}), children] }));
export default Nested;
