import { Echo } from './Echo.js';

export function ServerEcho({ echo }: { echo: string }) {
  return <Echo echo={echo} timestamp={Date.now()} />;
}
