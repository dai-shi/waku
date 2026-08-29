import { expectType } from 'ts-expect';
import type { TypeEqual } from 'ts-expect';
import { describe, it } from 'vitest';
import type { RouterHost } from '../src/router/client-core-utils/host.js';

describe('RouterHost contract', () => {
  it('keys are exactly route and navigate', () => {
    type HostKeys = keyof RouterHost;
    expectType<TypeEqual<HostKeys, 'route' | 'navigate'>>(true);
  });
});
