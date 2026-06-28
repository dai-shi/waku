const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function Clock() {
  await sleep(600);
  return <span data-testid="clock-value">clock loaded</span>;
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
    id: 'clock',
  } as const;
};
