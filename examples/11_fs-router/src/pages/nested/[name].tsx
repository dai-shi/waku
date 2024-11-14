import type { PageProps } from 'waku/router';

const Page = ({ name }: PageProps<'/nested/[name]'>) => (
  <div>
    <h2>Nested / {name}</h2>
  </div>
);

export default Page;
