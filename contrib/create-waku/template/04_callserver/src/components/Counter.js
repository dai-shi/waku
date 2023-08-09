"use client";
import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState, useTransition } from "react";
export const Counter = ({ greet, }) => {
    const [count, setCount] = useState(0);
    const [text, setText] = useState("");
    const [isPending, startTransition] = useTransition();
    const handleClick = () => {
        startTransition(() => {
            setText(greet("c=" + count));
        });
    };
    return (_jsxs("div", { style: { border: "3px blue dashed", margin: "1em", padding: "1em" }, children: [_jsxs("p", { children: ["Count: ", count] }), _jsx("button", { onClick: () => setCount((c) => c + 1), children: "Increment" }), _jsxs("p", { children: [_jsxs("button", { onClick: handleClick, children: ["greet(\"c=\" + count) = ", text] }), " ", isPending ? "Pending..." : ""] }), _jsx("h3", { children: "This is a client component." })] }));
};
