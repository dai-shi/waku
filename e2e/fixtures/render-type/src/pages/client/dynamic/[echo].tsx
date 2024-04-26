import { ClientEcho } from '../../../ClientEcho.js';

export default ClientEcho;

export async function getConfig() {
  return {
    render: 'dynamic',
  };
}
