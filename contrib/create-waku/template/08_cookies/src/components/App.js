import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { getContext } from "waku/server";
import { Counter } from "./Counter.js";
const App = ({ name = "Anonymous" }) => {
    const ctx = getContext();
    return (_jsxs("div", { style: { border: "3px red dashed", margin: "1em", padding: "1em" }, children: [_jsxs("h1", { children: ["Hello ", name, "!!"] }), _jsx("h3", { children: "This is a server component." }), _jsxs("p", { children: ["Cookie count: ", ctx.count] }), _jsx(Counter, {})] }));
};
export default App;
