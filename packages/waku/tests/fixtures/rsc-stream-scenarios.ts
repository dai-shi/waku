// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../src/lib/react-types.d.ts" />

import { Suspense, createElement } from 'react';
import { createFromReadableStream } from 'react-server-dom-webpack/client.edge';
import { renderToReadableStream } from 'react-server-dom-webpack/server.edge';

const scenarioName = process.env.WAKU_RSC_STREAM_SCENARIO;
const helperOutputUrl = process.env.WAKU_RSC_STREAM_HELPER_URL;

if (!scenarioName) {
  throw new Error('Missing scenario name.');
}
if (!helperOutputUrl) {
  throw new Error('Missing helper module URL.');
}

const { waitForRootPrerequisites } = await import(helperOutputUrl);

const serverConsumerManifest = {
  moduleMap: null,
  moduleLoading: null,
  serverModuleMap: null,
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const assertObjectLike = (value: unknown, message: string): object => {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  ) {
    throw new Error(message);
  }
  return value;
};

const getObjectProperty = (
  value: unknown,
  key: string,
  message: string,
): object =>
  assertObjectLike(Reflect.get(assertObjectLike(value, message), key), message);

const getStringProperty = (
  value: unknown,
  key: string,
  message: string,
): string => {
  const property = Reflect.get(assertObjectLike(value, message), key);
  if (typeof property !== 'string') {
    throw new Error(message);
  }
  return property;
};

const getPayloadChunk = (root: unknown): object =>
  getObjectProperty(
    getObjectProperty(
      getObjectProperty(root, 'props', 'Missing root.props.'),
      'children',
      'Missing root.props.children.',
    ),
    '_payload',
    'Missing root.props.children._payload.',
  );

function createScenarioRoot() {
  let resolveValue: (value: string) => void = (_value: string) => {
    throw new Error('Pending value resolver is not ready.');
  };
  const pendingValue = new Promise((resolve: (value: string) => void) => {
    resolveValue = resolve;
  });

  async function Delayed() {
    const value = await pendingValue;
    return createElement('div', null, value);
  }

  const model = createElement(
    Suspense,
    { fallback: createElement('div', null, 'loading') },
    createElement(Delayed),
  );

  return {
    resolveValue,
    root: createFromReadableStream(renderToReadableStream(model, {}), {
      serverConsumerManifest,
    }),
  };
}

async function waitUntil(
  getValue: () => boolean,
  errorMessage: string,
  attempts = 40,
) {
  for (let i = 0; i < attempts; i++) {
    if (getValue()) {
      return;
    }
    await sleep(5);
  }
  throw new Error(errorMessage);
}

function getPayloadStatus(root: unknown) {
  try {
    return getStringProperty(
      getPayloadChunk(root),
      'status',
      'Missing payload status.',
    );
  } catch {
    return null;
  }
}

function getPendingPayloadChunk(root: unknown) {
  const payload = getPayloadChunk(root);
  if (
    getStringProperty(payload, 'status', 'Missing payload status.') !==
    'pending'
  ) {
    throw new Error('Expected the payload chunk to still be pending.');
  }
  return payload;
}

async function runSettledRootScenario() {
  const { root, resolveValue } = createScenarioRoot();

  let rootSettled = false;
  void Promise.resolve(root)
    .then(() => {
      rootSettled = true;
    })
    .catch(() => {});

  await waitUntil(
    () => rootSettled,
    'Root did not settle before the delayed chunk resolved.',
  );

  const earlyRoot = await root;
  const payloadStatusBeforeResolve = getPayloadStatus(earlyRoot);

  let rootWaitSettled = false;
  const rootWaitPromise = waitForRootPrerequisites(root).then(() => {
    rootWaitSettled = true;
  });
  const rootWaitSettledBeforeResolve = rootWaitSettled;
  resolveValue('done');
  await rootWaitPromise;

  return {
    payloadStatusBeforeResolve,
    rootSettledBeforeResolve: rootSettled,
    rootWaitSettledBeforeResolve,
    payloadStatusAfterResolve: getPayloadStatus(earlyRoot),
  };
}

async function runBridgeChunkScenario() {
  const { root, resolveValue } = createScenarioRoot();
  const earlyRoot = await root;
  const payloadChunk = getPendingPayloadChunk(earlyRoot);
  const bridgeChunk = {
    status: 'fulfilled',
    reason: {
      _chunks: new Map([[0, payloadChunk]]),
    },
  };

  let bridgeWaitSettled = false;
  const bridgeWaitPromise = waitForRootPrerequisites(bridgeChunk).then(() => {
    bridgeWaitSettled = true;
  });
  const bridgeWaitSettledBeforeResolve = bridgeWaitSettled;

  resolveValue('done');
  await bridgeWaitPromise;
  return {
    bridgePendingCountBeforeResolve: 1,
    bridgeWaitSettledBeforeResolve,
  };
}

async function runPlainPendingDataScenario() {
  const root = {
    props: {
      children: [
        {
          id: '1',
          hostname: 'a.example.com',
          status: 'pending',
          sslStatus: 'pending_validation',
        },
        { id: '2', hostname: 'b.example.com', status: 'blocked' },
      ],
    },
  };

  let settled = false;
  await waitForRootPrerequisites(root).then(() => {
    settled = true;
  });

  return { settled };
}

switch (scenarioName) {
  case 'bridge-chunk':
    console.log(JSON.stringify(await runBridgeChunkScenario()));
    break;
  case 'settled-root':
    console.log(JSON.stringify(await runSettledRootScenario()));
    break;
  case 'plain-pending-data':
    console.log(JSON.stringify(await runPlainPendingDataScenario()));
    break;
  default:
    throw new Error(`Unknown scenario: ${scenarioName}`);
}
