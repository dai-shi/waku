export function Echo(props: any) {
  console.log('Echo', props); // FIXME echo is undefined
  return (
    <div>
      <p data-testid="echo">{props.echo}</p>
      <p data-testid="timestamp">{props.timestamp}</p>
    </div>
  );
}
