import { Path } from '../Path.js';

export default async function Test() {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return <Path />;
}

export async function getConfig() {
  return {
    render: 'static',
    staticPaths: new Array(5000).fill(null).map((_, i) => `path-${i}`),
  };
}
