import { Code as BrightCode, BrightProps } from "bright";

export const Code = ({ children }: { children: string }) => (
  <code className="bg-gray-200 p-1 rounded">{children}</code>
);

export const CodeBlock = ({
  children,
  lang,
}: {
  children: string;
  lang: BrightProps["lang"];
}) => (
  // @ts-expect-error
  <BrightCode
    className="p-0 !rounded-lg"
    theme="poimandres"
    code={children}
    lang={lang}
  />
);
