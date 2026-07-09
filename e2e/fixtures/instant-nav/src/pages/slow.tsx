const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function Slow() {
  await sleep(500);
  return <div data-testid="slow-body">Slow page</div>;
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
