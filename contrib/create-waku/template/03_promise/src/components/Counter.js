"use client";
import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Suspense, useState } from "react";
export const Counter = ({ delayedMessage, }) => {
    const [count, setCount] = useState(0);
    return (_jsxs("div", { style: { border: "3px blue dashed", margin: "1em", padding: "1em" }, children: [_jsxs("p", { children: ["Count: ", count] }), _jsx("button", { onClick: () => setCount((c) => c + 1), children: "Increment" }), _jsx("h3", { children: "This is a client component." }), _jsx(Suspense, { fallback: "Pending...", children: _jsx(Message, { count: count, delayedMessage: delayedMessage }) })] }));
};
const Message = ({ count, delayedMessage, }) => (_jsxs("ul", { children: [_jsxs("li", { children: ["count: ", count] }), _jsxs("li", { children: ["delayedMessage: ", delayedMessage] })] }));
