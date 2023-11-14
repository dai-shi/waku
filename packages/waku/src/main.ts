export { rsc } from './lib/middleware/rsc.js';

export async function build(options?: { ssr?: boolean }) {
  return (await import('./lib/builder.js')).build(options);
}
