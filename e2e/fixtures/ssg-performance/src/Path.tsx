import { getPath } from './context.js';

export function Path() {
  return <h1>{getPath()}</h1>;
}
