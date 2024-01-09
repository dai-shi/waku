import type { ComponentPropsWithoutRef, ElementType } from 'react';

type ButtonProps = ComponentPropsWithoutRef<'button'> &
  ComponentPropsWithoutRef<'a'>;

export const Button = ({ href, children, ...rest }: ButtonProps) => {
  let Element: ElementType = 'button';
  const props: ButtonProps = {};

  if (href) {
    Element = 'a';
    props.href = href;

    if (href.startsWith('http')) {
      props.target = '_blank';
      props.rel = 'noopener noreferrer';
    }
  }

  return (
    <Element
      className="text-red-50 rounded-md bg-primary px-4 py-3 text-base font-black uppercase  leading-none transition duration-300 ease-in-out hover:bg-secondary focus:ring-4 focus:ring-primary-300"
      {...props}
      {...rest}
    >
      {children}
    </Element>
  );
};
