import { describe, expect, test, vi } from 'vitest';
import {
  getHeaders,
  getRequest,
} from '../src/router/define-router-utils/request-store.js';
import * as server from '../src/router/server.js';

vi.mock('../src/server.js', () => ({}));

describe('waku/router/server surface', () => {
  test('exposes getRequest and keeps the unstable_ request accessors', () => {
    expect(server.getRequest).toBe(getRequest);
    expect(server.unstable_getRequest).toBe(getRequest);
    expect(server.unstable_getHeaders).toBe(getHeaders);
  });
});
