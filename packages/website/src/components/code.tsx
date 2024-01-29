import { getHighlighter } from 'shiki';

import theme from '../theme.json';

type CodeProps = {
  code: string;
};

export const Code = async ({ code, ...rest }: CodeProps) => {
  const highlighter = await getHighlighter({
    langs: ['tsx'],
    themes: [theme as any],
  });

  const html = highlighter.codeToHtml(code.trim(), {
    lang: 'tsx',
    theme: 'lucy',
  });

  return <div dangerouslySetInnerHTML={{ __html: html }} {...rest} />;
};
