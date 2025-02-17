import type { ReactNode } from 'react';

const Dynamic = async ({ children }: { children: ReactNode }) => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return (
    <div style={{ border: '3px orange dashed', margin: '1em', padding: '1em' }}>
      <h3>This is a dynamic server component.</h3>
      {children}
      <div>{new Date().toISOString()}</div>
    </div>
  );
};

export default Dynamic;
