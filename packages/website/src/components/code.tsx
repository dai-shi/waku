import { lazy } from 'react';

// TODO There's a limitation in waku/router.
// Because getSsrConfig is invoked without react-server condition,
// importing bright statically causes an error.
// FIXME we should be able to avoid this workaround.
const BrightCode = lazy(async () => ({
  default: (await import('bright')).Code,
}));

import theme from '../theme.json';

type CodeProps = {
  code: string;
};

export const Code = ({ code, ...rest }: CodeProps) => (
  <BrightCode lang="tsx" theme={theme} code={code.trim()} {...rest} />
);
