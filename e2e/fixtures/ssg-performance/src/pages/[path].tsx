export default async function Test({ path }: { path: string }) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return <h1>{path}</h1>;
}

export async function getConfig() {
  return {
    render: 'static',
    staticPaths: new Array(10000).fill(null).map((_, i) => `path-${i}`),
  };
}
