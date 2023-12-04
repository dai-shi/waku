'use server';

import type { RenderContext } from 'waku/server';

// module state on server
let message = '';

export const getMessage = () => message;

export function greet(this: RenderContext, formData: FormData) {
  message = `Hello ${formData.get('name') || 'Anonymous'} from server!`;
  this.rerender('');
}

export const increment = (count: number) => count + 1;
