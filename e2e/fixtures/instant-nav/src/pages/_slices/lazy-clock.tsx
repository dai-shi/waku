export default function LazyClock() {
  return <span data-testid="lazy-clock-value">lazy clock loaded</span>;
}

export const getConfig = async () => {
  return {
    render: 'static',
    id: 'lazy-clock',
  } as const;
};
