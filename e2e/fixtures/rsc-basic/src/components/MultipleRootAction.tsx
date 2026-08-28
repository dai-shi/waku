'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { useRegisterRscReloadListener_UNSTABLE as useRegisterRscReloadListener } from 'waku/minimal/client';
import { updateContent } from './ServerPing/actions.js';

type RootName = 'first' | 'second' | 'third';

export const MultipleRootAction = ({ name }: { name: RootName }) => {
  const registerRscReloadListener = useRegisterRscReloadListener();
  const [ownsHmr, setOwnsHmr] = useState(false);
  useLayoutEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('descendant-hmr') === name || ownsHmr
      ? registerRscReloadListener(
          () => {
            (
              globalThis as typeof globalThis & {
                __WAKU_TEST_HMR_TARGET__?: RootName;
              }
            ).__WAKU_TEST_HMR_TARGET__ = name;
          },
          { replace: true },
        )
      : undefined;
  }, [name, ownsHmr, registerRscReloadListener]);
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const next =
      name === 'first'
        ? 'second'
        : name === 'second' && searchParams.has('three-roots')
          ? 'third'
          : undefined;
    if (next) {
      (
        globalThis as typeof globalThis & {
          __WAKU_MOUNT_ROOT__?: (name: RootName) => void;
        }
      ).__WAKU_MOUNT_ROOT__?.(next);
    }
  }, [name]);
  return (
    <>
      <button onClick={() => updateContent()}>Update content</button>
      <button onClick={() => setOwnsHmr(true)}>
        {ownsHmr ? 'Owns HMR' : 'Own HMR'}
      </button>
    </>
  );
};
