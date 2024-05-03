const Page = ({ wildcard }: { wildcard: string[] }) => (
  <div>
    <h1>/{wildcard.join('/')}</h1>
  </div>
);

export const getConfig = async () => {
  return {
    render: 'static',
    staticPaths: [[], 'foo', ['bar', 'baz']],
  };
};

export default Page;
