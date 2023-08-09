import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Counter } from "./Counter.js";
import { getCounter, increment } from "./funcs.js";
const App = ({ name = "Anonymous" }) => {
    return (_jsxs("div", { style: { border: "3px red dashed", margin: "1em", padding: "1em" }, children: [_jsxs("h1", { children: ["Hello ", name, "!!"] }), _jsx("h3", { children: "This is a server component." }), _jsxs("p", { children: ["Server counter: ", getCounter()] }), _jsx(Counter, { increment: increment })] }));
};
export default App;
