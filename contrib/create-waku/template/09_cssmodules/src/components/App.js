import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
// @ts-expect-error no types
import styles from "./App.module.css";
import { Counter } from "./Counter.js";
const App = ({ name = "Anonymous" }) => {
    return (_jsxs("div", { style: { border: "3px red dashed", margin: "1em", padding: "1em" }, children: [_jsxs("h1", { className: styles.title, children: ["Hello ", name, "!!"] }), _jsx("h3", { children: "This is a server component." }), _jsx(Counter, {})] }));
};
export default App;
