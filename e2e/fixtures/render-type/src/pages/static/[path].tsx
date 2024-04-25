export default async function Test({ path }: { path: string }) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return <h1>{path}</h1>;
}

export async function getConfig() {
  return {
    render: 'static',
    staticPaths: ['static-page'],
  };
}
