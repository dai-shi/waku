import { Code as BrightCode, BrightProps } from "bright";

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
  <BrightCode
    className="!p-0 !rounded-2xl overflow-scroll max-w-xs sm:max-w-sm md:max-w-md lg:max-w-full !m-0 border-2 border-cVanilla"
    theme="solarized-light"
    code={children}
    lang={lang}
  />
);
