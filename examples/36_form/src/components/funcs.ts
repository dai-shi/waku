'use server';

import { rerender } from '../als';

// module state on server
let message = '';

export const getMessage = async () => message;

export const greet = async (formData: FormData) => {
  message = `Hello ${formData.get('name') || 'Anonymous'} from server!`;
  rerender('');
};

export const increment = async (count: number) => count + 1;
