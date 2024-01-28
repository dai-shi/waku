import { Code as BrightCode } from 'bright';

import { ClientOnly } from './client-only.js';
import theme from '../theme.json';

type CodeProps = {
  code: string;
};

export const Code = ({ code, ...rest }: CodeProps) => (
  <ClientOnly>
    <BrightCode lang="tsx" theme={theme} code={code.trim()} {...rest} />
  </ClientOnly>
);
