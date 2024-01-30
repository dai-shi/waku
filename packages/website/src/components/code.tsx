import { highlighter } from '../lib/index.js';

type CodeProps = {
  code: string;
};

export const Code = async ({ code, ...rest }: CodeProps) => {
  const html = highlighter.codeToHtml(code.trim(), {
    lang: 'tsx',
    theme: 'lucy',
  });

  return <div dangerouslySetInnerHTML={{ __html: html }} {...rest} />;
};
