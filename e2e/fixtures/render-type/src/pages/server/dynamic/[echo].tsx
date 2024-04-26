import { ServerEcho } from '../../../ServerEcho.js';
export default ServerEcho;

export async function getConfig() {
  return {
    render: 'dynamic',
  };
}
