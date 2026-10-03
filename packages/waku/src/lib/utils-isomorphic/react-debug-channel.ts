export const DEBUG_ID_HEADER = 'X-Waku-Debug-Id';
export const DEBUG_CMD_EVENT = 'waku:debug-cmd';
export const DEBUG_DATA_EVENT = 'waku:debug-data';

type DebugCmdEventReadyPayload = {
  i: string; // debugId
};
type DebugCmdEventChunkPayload = {
  i: string; // debugId
  b: string; // base64 encoded chunk
};
type DebugCmdEventDonePayload = {
  i: string; // debugId
  d: true; // done flag
};
type DebugDataEventChunkPayload = {
  i: string; // debugId
  b: string; // base64 encoded chunk
};
type DebugDataEventDonePayload = {
  i: string; // debugId
  d: true; // done flag
};
export type DebugEventPayload =
  | DebugCmdEventReadyPayload
  | DebugCmdEventChunkPayload
  | DebugCmdEventDonePayload
  | DebugDataEventChunkPayload
  | DebugDataEventDonePayload;

export function assertIsDebugEventPayload(
  payload: unknown,
): asserts payload is DebugEventPayload {
  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof (payload as { i?: unknown }).i !== 'string' ||
    ('b' in payload && typeof (payload as { b?: unknown }).b !== 'string') ||
    ('d' in payload && (payload as { d?: unknown }).d !== true)
  ) {
    throw new Error('Invalid debug event payload');
  }
}
