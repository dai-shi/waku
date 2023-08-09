import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "waku/router/server";
const Pending = ({ isPending }) => (_jsx("span", { style: {
        marginLeft: 5,
        transition: "opacity 75ms 100ms",
        opacity: isPending ? 1 : 0,
    }, children: "Pending..." }));
const Index = ({ children }) => (_jsxs("div", { children: [_jsxs("ul", { children: [_jsx("li", { children: _jsx(Link, { href: "/", pending: _jsx(Pending, { isPending: true }), notPending: _jsx(Pending, { isPending: false }), children: "Home" }) }), _jsx("li", { children: _jsx(Link, { href: "/foo", pending: _jsx(Pending, { isPending: true }), notPending: _jsx(Pending, { isPending: false }), children: "Foo" }) }), _jsx("li", { children: _jsx(Link, { href: "/bar", unstable_prefetchOnEnter: true, children: "Bar" }) }), _jsx("li", { children: _jsx(Link, { href: "/nested/baz", children: "Nested / Baz" }) }), _jsx("li", { children: _jsx(Link, { href: "/nested/qux", children: "Nested / Qux" }) })] }), _jsx("h1", { children: "Home" }), children] }));
export default Index;
