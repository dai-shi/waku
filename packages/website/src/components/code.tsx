import { Code } from "bright";

const code1 = `
import { lazy } from "react";
import { defineEntries } from "waku/server";

const App = lazy(() => import("./components/App.js"));

export default defineEntries(
  // renderEntries
  async (input) => {
    return {
      App: <App name={input || "Waku"} />,
    };
  },
);
`.trim();

export const Code1 = () => (
  <Code
    className="border-cVanilla !m-0 max-w-xs overflow-scroll !rounded-2xl border-2 !p-0 sm:max-w-sm md:max-w-md lg:max-w-full"
    theme="solarized-dark"
    code={code1}
    lang="tsx"
  />
);
