'use server';

import { unstable_rerenderRoute } from 'waku/router/server';

// module state on server
let message = '';

export const getMessage = async () => message;

export const greet = async (formData: FormData) => {
  // simulate a slow server response
  await new Promise((resolve) => setTimeout(resolve, 1000));
  message = `Hello ${formData.get('name') || 'Anonymous'} from server!`;
  unstable_rerenderRoute('/');
};

export const increment = async (count: number) => count + 1;
