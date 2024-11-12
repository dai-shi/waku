import { Echo } from './Echo.js';

export function ServerEcho(props: any) {
  console.log('ServerEcho', props); // FIXME echo is undefined
  return <Echo echo={props.echo} timestamp={Date.now()} />;
}
