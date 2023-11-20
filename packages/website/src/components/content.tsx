import fs from 'node:fs';
// @ts-expect-error no exported member
import { MDXRemote } from 'next-mdx-remote/rsc';

import { Code } from './code.js';

export const Content = () => {
  const file = fs.readFileSync('../../README.md', 'utf8');
  const source = `## Introduction${file
    .split('## Introduction')[1]
    ?.split('## Tweets')[0]}`;

  return <MDXRemote source={source} components={components} />;
};

const components = {
  h2: ({ children, ...rest }: any) => (
    <h2
      className="mb-2 mt-16 text-[2.75rem] font-bold leading-none first-of-type:mt-0"
      {...rest}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...rest }: any) => (
    <h3 className="mb-2 mt-8 text-3xl font-bold leading-none" {...rest}>
      {children}
    </h3>
  ),
  h4: ({ children, ...rest }: any) => (
    <h3
      {...rest}
      className="mb-2 mt-8 text-xl font-bold uppercase leading-none tracking-wide"
    >
      {children}
    </h3>
  ),
  p: ({ children, ...rest }: any) => (
    <p
      className="mb-4 text-lg font-normal leading-normal text-white/60 lg:text-xl"
      {...rest}
    >
      {children}
    </p>
  ),
  code: ({ children, ...rest }: any) => (
    <span
      className="-my-0.5 inline-block rounded bg-gray-800 px-1.5 py-px font-mono text-base text-white/80"
      {...rest}
    >
      {children}
    </span>
  ),
  pre: ({ children, ...rest }: any) => (
    <Code
      code={children.props.children}
      className="!-mx-[0.75em] !overflow-clip !rounded-xl !bg-gray-800 !p-[0.5em] !font-mono [&>*]:!bg-gray-800"
      {...rest}
    />
  ),
};
