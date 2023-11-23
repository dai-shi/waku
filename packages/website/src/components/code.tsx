import { Code as Component } from 'bright';

import theme from '../theme.json';

type CodeProps = {
  code: string;
};

export const Code = ({ code, ...rest }: CodeProps) => (
  <Component lang="tsx" theme={theme} code={code.trim()} {...rest} />
);
