import { unstable_notFound as notFound } from 'waku/router/server';

export default async function AsyncPage() {
  await new Promise((resolve) => setTimeout(resolve, 100));
  notFound();
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
