'use server';

import { AI } from '../actions/index.js';
import { Inner } from './inner.js';

export default function Page() {
  return (
    <AI>
      <Inner />
    </AI>
  );
}
