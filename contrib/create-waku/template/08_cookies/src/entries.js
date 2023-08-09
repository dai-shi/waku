import { defineEntries, getContext } from "waku/server";
export default defineEntries(
// getEntry
async (id) => {
    const ctx = getContext();
    ++ctx.count;
    switch (id) {
        case "App":
            return import("./components/App.js");
        default:
            return null;
    }
}, 
// getBuildConfig
async () => {
    return {
        "/": {
            elements: [["App", { name: "Waku" }]],
            ctx: { count: 0 },
        },
    };
});
