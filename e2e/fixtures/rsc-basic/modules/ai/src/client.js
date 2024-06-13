'use client';
import { useActions } from './shared.js';

export { useActions };

export function createAI() {
  throw new Error('You should not call createAI in the client side');
}
