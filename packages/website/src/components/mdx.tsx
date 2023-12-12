import { Code } from './code.js';

export const components = {
  h2: ({ children, ...rest }: any) => (
    <h2
      className="mb-2 mt-16 text-3xl font-bold leading-none first-of-type:mt-0 sm:text-[2.75rem]"
      {...rest}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...rest }: any) => (
    <h3
      className="mb-2 mt-8 text-xl font-bold leading-none sm:text-3xl"
      {...rest}
    >
      {children}
    </h3>
  ),
  h4: ({ children, ...rest }: any) => (
    <h3
      {...rest}
      className="mb-2 mt-8 text-lg font-bold uppercase leading-none tracking-wide sm:text-xl"
    >
      {children}
    </h3>
  ),
  p: ({ children, ...rest }: any) => (
    <p
      className="mb-4 text-base font-normal leading-normal text-white/60 sm:text-lg lg:text-xl"
      {...rest}
    >
      {children}
    </p>
  ),
  strong: ({ children, ...rest }: any) => (
    <b className="font-bold text-white" {...rest}>
      {children}
    </b>
  ),
  a: ({ children, ...rest }: any) => (
    <a className="text-white/80 underline" target="_blank" {...rest}>
      {children}
    </a>
  ),
  ul: ({ children, ...rest }: any) => (
    <ul
      className="mb-4 ml-4 list-disc text-base font-normal leading-normal text-white/60 sm:text-lg lg:text-xl"
      {...rest}
    >
      {children}
    </ul>
  ),
  code: ({ children, ...rest }: any) => (
    <span
      className="-my-0.5 inline-block rounded bg-gray-800 px-1.5 py-px font-mono text-sm text-white/80 sm:text-base"
      {...rest}
    >
      {children}
    </span>
  ),
  pre: ({ children, ...rest }: any) => (
    <Code
      code={children.props.children}
      className="!-mx-[0.75em] !overflow-clip !rounded-xl !bg-gray-800 !p-0 !font-mono !text-sm sm:!p-[0.5em] sm:!text-base [&>*]:!bg-gray-800"
      {...rest}
    />
  ),
};
