// Escape control chars: newlines become a visible "\n" and other control bytes become "\xNN".
// https://cwe.mitre.org/data/definitions/117.html
export const sanitizeLog = (value: unknown): string => {
  const str =
    value instanceof Error ? (value.stack ?? value.message) : String(value);
  const CONTROL_CHAR = /\p{Cc}/gu;
  return str.replace(CONTROL_CHAR, (char) =>
    char === '\n'
      ? '\\n'
      : `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`,
  );
};
