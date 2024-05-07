import { getEnv } from 'waku/server';

export default function Test({ title }: { title: string }) {
  return <div data-testid="title">{title}</div>;
}

export async function getConfig() {
  return {
    render: 'static',
    staticPaths: getEnv('PAGES')?.split(',') || [],
  };
}
