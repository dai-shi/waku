import { Link } from 'waku';

import { Code } from './code.js';
import { getAnchor } from '../utils/index.js';

export const components = {
  h2: ({ children, ...rest }: any) => {
    const id = getAnchor(children);

    return (
      <h2
        id={id}
        className="mb-2 mt-16 scroll-mt-16 text-balance text-3xl font-bold leading-none text-white first:mt-0 sm:text-[2.75rem] xl:mt-32"
        {...rest}
      >
        <a href={`#${id}`}>{children}</a>
      </h2>
    );
  },
  h3: ({ children, ...rest }: any) => {
    const id = getAnchor(children);

    return (
      <h3
        id={id}
        className="mb-2 mt-8 scroll-mt-8 text-balance text-xl font-bold leading-none text-white sm:text-3xl"
        {...rest}
      >
        <a href={`#${id}`}>{children}</a>
      </h3>
    );
  },
  h4: ({ children, ...rest }: any) => {
    const id = getAnchor(children);

    return (
      <h4
        id={id}
        className="mb-2 mt-8 scroll-mt-8 text-balance text-lg font-bold uppercase leading-none tracking-wide text-white sm:text-xl"
        {...rest}
      >
        <a href={`#${id}`}>{children}</a>
      </h4>
    );
  },
  p: ({ children, ...rest }: any) => {
    return (
      <p
        className="mb-4 text-pretty text-sm font-normal leading-normal text-white/60 sm:text-lg lg:text-xl"
        {...rest}
      >
        {children}
      </p>
    );
  },
  strong: ({ children, ...rest }: any) => {
    return (
      <b className="font-bold text-white" {...rest}>
        {children}
      </b>
    );
  },
  em: ({ children, ...rest }: any) => {
    return (
      <i className="italic text-white/70" {...rest}>
        {children}
      </i>
    );
  },
  a: ({ href, children, ...rest }: any) => {
    const classNames =
      'text-white/80 underline decoration-white/60 decoration-1 transition-colors duration-300 ease-in-out hover:text-white';

    if (href.startsWith('/')) {
      <Link to={href} className={classNames} {...rest}>
        {children}
      </Link>;
    }

    return (
      <a
        href={href}
        className={classNames}
        target="_blank"
        rel="noreferrer"
        {...rest}
      >
        {children}
      </a>
    );
  },
  ul: ({ children, ...rest }: any) => {
    return (
      <ul
        className="mb-4 ml-4 list-disc text-base font-normal leading-normal text-white/60 sm:text-lg lg:text-xl"
        {...rest}
      >
        {children}
      </ul>
    );
  },
  code: ({ children, ...rest }: any) => {
    return (
      <span
        className="-my-0.5 inline-block rounded bg-gray-900 px-1.5 py-px font-mono text-[13px] text-white/80 sm:text-base"
        {...rest}
      >
        {children}
      </span>
    );
  },
  pre: ({ children, ...rest }: any) => {
    return (
      <Code
        code={children.props.children}
        className="code !mb-16 max-w-full overflow-clip overflow-x-scroll rounded-xl bg-gray-900 p-4 font-mono text-sm sm:-mx-3 sm:max-w-[calc(100%+1rem)] sm:p-6 sm:text-base [&>*]:!bg-gray-900"
        {...rest}
      />
    );
  },
  blockquote: ({ children, ...rest }: any) => {
    return (
      <div className="overflow-clip rounded-xl bg-gray-950 sm:!-mx-3">
        <blockquote className="p-4 sm:p-6" {...rest}>
          <div className="mb-1 flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 128 128"
              width="64px"
              height="64px"
              className="size-3.5 fill-current text-white"
            >
              <path d="M 64 6 C 32 6 6 32 6 64 C 6 96 32 122 64 122 C 96 122 122 96 122 64 C 122 32 96 6 64 6 z M 64 12 C 92.7 12 116 35.3 116 64 C 116 92.7 92.7 116 64 116 C 35.3 116 12 92.7 12 64 C 12 35.3 35.3 12 64 12 z M 64 30 A 9 9 0 0 0 64 48 A 9 9 0 0 0 64 30 z M 64 59 C 59 59 55 63 55 68 L 55 92 C 55 97 59 101 64 101 C 69 101 73 97 73 92 L 73 68 C 73 63 69 59 64 59 z" />
            </svg>
            <div className="text-sm font-black uppercase leading-none tracking-wide text-white sm:text-base">
              Note
            </div>
          </div>
          <div className="[&>*]:!text-sm [&>*]:!text-white/60 [&>*]:last:!mb-0 [&>*]:sm:!text-base">
            {children}
          </div>
        </blockquote>
      </div>
    );
  },
};
