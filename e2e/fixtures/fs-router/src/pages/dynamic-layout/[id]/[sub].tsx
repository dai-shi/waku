import type { PageProps } from 'waku/router';

const Page = ({ id, sub }: PageProps<'/dynamic-layout/[id]/[sub]'>) => (
  <div>
    <h2>
      {id} / {sub}
    </h2>
  </div>
);

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};

export default Page;
