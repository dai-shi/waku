'use server';

import { rerender } from 'waku/server';

// module state on server
let message = '';

export const getMessage = () => message;

export const greet = (formData: FormData) => {
  message = `Hello ${formData.get('name') || 'Anonymous'} from server!`;
  rerender('');
};

export const increment = (count: number) => count + 1;
