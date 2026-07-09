const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function Hover() {
  await sleep(300);
  return <div data-testid="hover-body">Hover page</div>;
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
