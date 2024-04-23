export default function Test({ path }: { path: string }) {
  return <h1>{path}</h1>;
}

export async function getConfig() {
  return {
    render: 'static',
    staticPaths: new Array(10000).fill(null).map((_, i) => `path-${i}`),
  };
}
