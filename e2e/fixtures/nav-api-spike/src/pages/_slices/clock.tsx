export default function ClockSlice() {
  return <p data-testid="slice-clock">lazy clock</p>;
}

export const getConfig = () =>
  ({
    render: 'dynamic',
    id: 'clock',
  }) as const;
