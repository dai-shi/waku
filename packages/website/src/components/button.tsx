import type { ComponentPropsWithoutRef, ElementType } from 'react';
import cx from 'classnames';

type ButtonProps = ComponentPropsWithoutRef<'button'> &
  ComponentPropsWithoutRef<'a'>;

export const Button = ({
  href,
  className = '',
  children,
  ...rest
}: ButtonProps) => {
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
      className={cx(
        'rounded-md bg-red-900 px-4 py-3 text-base font-black uppercase leading-none tracking-wide text-red-50 transition duration-300 ease-in-out hover:bg-red-800',
        className,
      )}
      {...props}
      {...rest}
    >
      {children}
    </Element>
  );
};
