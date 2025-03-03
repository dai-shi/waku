import type { StreamableValue } from './create-streamable-value.js';

export function isStreamableValue(value: unknown): value is StreamableValue {
  return (
    value != null &&
    typeof value === 'object' &&
    'type' in value &&
    value.type === Symbol.for('ui.streamable.value')
  );
}
