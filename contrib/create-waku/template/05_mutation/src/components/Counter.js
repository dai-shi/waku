"use client";
import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
import { mutate } from "waku/client";
export const Counter = ({ increment }) => {
    const [count, setCount] = useState(0);
    return (_jsxs("div", { style: { border: "3px blue dashed", margin: "1em", padding: "1em" }, children: [_jsxs("p", { children: ["Count: ", count] }), _jsx("button", { onClick: () => setCount((c) => c + 1), children: "Increment" }), _jsx("p", { children: _jsx("button", { onClick: () => mutate(() => increment()), children: "Increment server counter" }) }), _jsx("h3", { children: "This is a client component." })] }));
};
