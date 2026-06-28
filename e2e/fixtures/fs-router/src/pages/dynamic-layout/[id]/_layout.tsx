import type { LayoutProps } from 'waku/router';

const DynamicLayout = ({
  id,
  children,
}: LayoutProps<'/dynamic-layout/[id]'>) => (
  <div>
    <span data-testid="dynamic-layout-id">{id}</span>
    {children}
  </div>
);

export default DynamicLayout;
