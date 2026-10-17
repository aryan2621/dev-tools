/** Best-effort read of a string field out of a half-streamed JSON object. */
export function partialField(raw: string, field: string): string {
  const m = raw.match(new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`));
  if (!m) return '';
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    // The stream may stop mid-escape (a trailing backslash); show what we have.
    return m[1].replace(/\\$/, '');
  }
}
