export function Echo({ echo, timestamp }: { echo: string; timestamp: number }) {
  return (
    <div>
      <p data-testid="echo">{echo}</p>
      <p data-testid="timestamp">{timestamp}</p>
    </div>
  );
}
