import { Suspense, lazy } from "react";
import type { BrightProps } from "bright";

// import { Code as BrightCode } from "bright";
// FIXME: For now, this is a hack to bypass server-only error with SSR.
const BrightCode = lazy(async () => ({
  default: (await import("bright")).Code,
}));

export const Code = ({ children }: { children: string }) => (
  <code className="text-cCarmine font-mono rounded-full px-1 py-1">
    {children}
  </code>
);

export const CodeBlock = ({
  children,
  lang,
}: {
  children: string;
  lang: BrightProps["lang"];
}) => (
  <Suspense>
    <BrightCode
      className="!p-0 !rounded-2xl overflow-scroll max-w-xs sm:max-w-sm md:max-w-md lg:max-w-full !m-0 border-2 border-cVanilla"
      theme="solarized-light"
      code={children}
      lang={lang}
    />
  </Suspense>
);
