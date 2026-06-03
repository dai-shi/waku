import { unstable_getRequest as getRequest } from 'waku/router/server';
import { Echo } from './Echo.js';

export function ServerEcho({ echo }: { echo: string }) {
  // TODO is there a more reasonable way?
  // eslint-disable-next-line react-hooks/purity
  const now = performance.now();
  return (
    <>
      <Echo echo={echo} timestamp={now} />
      <p data-testid="req-url">{getRequest().url}</p>
    </>
  );
}
