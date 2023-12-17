import { Code as BrightCode } from 'bright';

import theme from '../theme.json';

type CodeProps = {
  code: string;
};

export const Code = ({ code, ...rest }: CodeProps) => (
  <BrightCode lang="tsx" theme={theme} code={code.trim()} {...rest} />
);
