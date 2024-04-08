import { codeToHtml } from '../lib/shiki';

type CodeProps = {
  code: string;
};

export const Code = async ({ code, ...rest }: CodeProps) => {
  const html = await codeToHtml(code.trim(), {
    lang: 'tsx',
    theme: 'lucy',
  });

  return <div dangerouslySetInnerHTML={{ __html: html }} {...rest} />;
};
