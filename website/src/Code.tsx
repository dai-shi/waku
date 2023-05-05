export const Code = ({ children }: { children: string }) => (
  <code className="bg-gray-200 p-1 rounded">{children}</code>
);

export const CodeBlock = ({ children }: { children: string }) => (
  <div className="p-4 bg-gray-300 rounded-lg overflow-x-scroll">
    <code className="block whitespace-pre">{children}</code>
  </div>
);
