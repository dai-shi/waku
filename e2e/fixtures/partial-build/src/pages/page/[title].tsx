import { getEnv } from 'waku';

export default function Test({ title }: { title: string }) {
  console.log('rendering', title);
  return <div data-testid="title">{title}</div>;
}

export async function getConfig() {
  return {
    render: 'static',
    staticPaths: getEnv('PAGES')?.split(',') || [],
  };
}
