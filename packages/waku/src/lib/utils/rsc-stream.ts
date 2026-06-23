type AnyFunction = (...args: unknown[]) => unknown;

type FlightChunk = {
  _children?: unknown;
  reason?: unknown;
  status: string;
  then?: AnyFunction;
  value?: unknown;
};

type FlightRecordLike = {
  _children?: unknown;
  _payload?: unknown;
  handler?: { chunk?: unknown };
  props?: unknown;
  value?: unknown;
};

const isObjectOrFunction = (value: unknown): value is object | AnyFunction =>
  value !== null && (typeof value === 'object' || typeof value === 'function');

const isFlightChunk = (value: unknown): value is FlightChunk =>
  isObjectOrFunction(value) &&
  'status' in value &&
  typeof value.status === 'string' &&
  (!('then' in value) || typeof value.then === 'function');

const isFlightRecordLike = (value: unknown): value is FlightRecordLike =>
  isObjectOrFunction(value) &&
  (!('handler' in value) ||
    (isObjectOrFunction(value.handler) && 'chunk' in value.handler)) &&
  ('_payload' in value ||
    'handler' in value ||
    '_children' in value ||
    'value' in value ||
    'props' in value);

const isPendingStatus = (value: string) =>
  value === 'pending' || value === 'blocked';

const pushInspectable = (stack: object[], value: unknown) => {
  if (isObjectOrFunction(value)) {
    stack.push(value);
  }
};

const pushInspectableValues = (stack: object[], values: Iterable<unknown>) => {
  for (const value of values) {
    pushInspectable(stack, value);
  }
};

const pushChunkEdges = (stack: object[], chunk: FlightChunk) => {
  if (Array.isArray(chunk._children)) {
    pushInspectableValues(stack, chunk._children);
  }
  pushInspectable(stack, chunk.value);
  pushInspectable(stack, chunk.reason);
};

const pushRecordEdges = (stack: object[], record: FlightRecordLike) => {
  pushInspectable(stack, record._payload);
  if (record.handler) {
    pushInspectable(stack, record.handler.chunk);
  }
  if (Array.isArray(record._children)) {
    pushInspectableValues(stack, record._children);
  }
  pushInspectable(stack, record.value);
  pushInspectable(stack, record.props);
};

const pushObjectValues = (stack: object[], value: object) => {
  pushInspectableValues(stack, Object.values(value));
};

const collectFlightChunks = (root: unknown): FlightChunk[] => {
  const seen = new Set<object>();
  const chunks: FlightChunk[] = [];
  const stack: object[] = [];

  if (isObjectOrFunction(root)) {
    stack.push(root);
  }

  while (stack.length) {
    const value = stack.pop();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      pushInspectableValues(stack, value);
      continue;
    }
    if (value instanceof Map) {
      pushInspectableValues(stack, value.keys());
      pushInspectableValues(stack, value.values());
      continue;
    }
    if (value instanceof Set) {
      pushInspectableValues(stack, value.values());
      continue;
    }
    if (isFlightChunk(value)) {
      chunks.push(value);
      pushChunkEdges(stack, value);
      continue;
    }
    if (isFlightRecordLike(value)) {
      pushRecordEdges(stack, value);
    }
    pushObjectValues(stack, value);
  }
  return chunks;
};

export async function waitForRootPrerequisites(root: unknown): Promise<void> {
  while (true) {
    const unresolvedChunks = collectFlightChunks(root).filter(
      (chunk) =>
        isPendingStatus(chunk.status) && typeof chunk.then === 'function',
    );
    if (unresolvedChunks.length === 0) {
      return;
    }
    await Promise.allSettled(unresolvedChunks);
  }
}
