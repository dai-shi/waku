"use client";
import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
import { serve } from "waku/client";
// XXX This is not recommended in practice
// as it can easily make client server waterfalls.
const InnerApp = serve("InnerApp");
export const Counter = ({ enableInnerApp = false }) => {
    const [count, setCount] = useState(0);
    return (_jsxs("div", { style: { border: "3px blue dashed", margin: "1em", padding: "1em" }, children: [_jsxs("p", { children: ["Count: ", count] }), _jsx("button", { onClick: () => setCount((c) => c + 1), children: "Increment" }), _jsx("h3", { children: "This is a client component." }), enableInnerApp && _jsx(InnerApp, { count: count })] }));
};
