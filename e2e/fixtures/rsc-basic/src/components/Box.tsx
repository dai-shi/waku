import type { ReactNode, HTMLAttributes } from 'react';

export const ServerBox = ({
  children,
  ...props
}: { children: ReactNode } & HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      {...props}
      style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}
    >
      {children}
    </div>
  );
};

// use div props
export const ClientBox = ({
  children,
  ...props
}: { children: ReactNode } & HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      {...props}
      style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}
    >
      {children}
    </div>
  );
};
