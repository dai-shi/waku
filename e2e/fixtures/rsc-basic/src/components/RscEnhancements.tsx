'use client';

import { use, useEffect, useState } from 'react';
import {
  Slot_UNSTABLE as Slot,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useFetchRsc_UNSTABLE as useFetchRsc,
  useMergeElements_UNSTABLE as useMergeElements,
  useRegisterRscEnhancer_UNSTABLE as useRegisterRscEnhancer,
} from 'waku/minimal/client';
import { ping } from './ServerPing/actions.js';

const VERSION = Symbol();
const RETAINED = Symbol();
const CLEARED = Symbol();

export const RscEnhancements = ({ name }: { name: string }) => {
  const register = useRegisterRscEnhancer();
  const fetchRsc = useFetchRsc();
  const mergeElements = useMergeElements();
  const elements = use(useElementsPromise());
  const [value, setValue] = useState('');
  useEffect(() => {
    let version = 0;
    return register((next) => async (path, params, options) => {
      const { elements, value } = await next(
        path === 'enhanced' ? name : path,
        options.type === 'rsc' ? { input: params, name } : params,
        {
          ...options,
          fetch: (input, init) => {
            const headers = new Headers(init?.headers);
            headers.set('X-Enhancer', name);
            return options.fetch(input, { ...init, headers });
          },
        },
      );
      version += 1;
      return {
        elements: {
          ...elements,
          enhancedBy: `${name}:${options.type}`,
          [VERSION]: version,
          ...(version === 1
            ? { [RETAINED]: 'retained', [CLEARED]: 'clear me' }
            : { [CLEARED]: undefined }),
        },
        value,
      };
    });
  }, [name, register]);
  return (
    <>
      <button
        onClick={async () => {
          await mergeElements(await fetchRsc('enhanced', { count: 1 }));
        }}
      >
        Enhanced fetch
      </button>
      <button
        onClick={async () => {
          setValue(await ping());
        }}
      >
        Enhanced action
      </button>
      <p data-testid="action-value">{value}</p>
      <p data-testid="enhanced-by">
        <Slot id="enhancedBy" />
      </p>
      <p data-testid="enhancer-input">
        <Slot id="EnhancerInput" />
      </p>
      <p data-testid="enhanced-version">{String(elements[VERSION])}</p>
      <p data-testid="retained-symbol">{String(elements[RETAINED])}</p>
      <p data-testid="cleared-symbol">
        {CLEARED in elements ? String(elements[CLEARED]) : 'absent'}
      </p>
    </>
  );
};
