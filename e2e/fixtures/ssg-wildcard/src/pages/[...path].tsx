const Page = ({ path }: { path: string }) => (
  <div>
    <h1>{path}</h1>
  </div>
);

export const getConfig = async () => {
  return {
    render: 'static',
    staticPaths: [[], 'foo', ['bar', 'baz']],
  };
};

export default Page;
