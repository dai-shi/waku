import { fsRouter } from 'waku';
import adapter from 'waku/adapters/cloudflare';
import { queueState } from './queue-state.js';

export default adapter(fsRouter(import.meta.glob('./pages/**/*.{tsx,ts}')), {
  handlers: {
    async queue(batch: { messages: { body: unknown }[] }) {
      queueState.message = String(batch.messages[0]?.body ?? '');
    },
  },
});
