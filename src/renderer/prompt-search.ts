// Build robust search keys to locate where a submitted prompt was rendered in the
// terminal. A full-text match is unreliable: long prompts get hard-wrapped by some
// agents into multiple lines (not soft-wrapped, so xterm search won't join them),
// agents may prefix each line with a gutter/leading spaces, and the wrap width
// changes with the window. So we search a short leading chunk of the prompt's first
// non-empty line — it sits at the start of the first rendered segment (any gutter or
// leading spaces come before it, so a substring match still hits), sized to fit
// within one row at the current width, and we return progressively shorter keys so
// an unknown gutter size can't push every key past the first segment.
export function promptSearchKeys(text: string, cols: number): string[] {
  const firstLine = text.split("\n").map((line) => line.trim()).find((line) => line.length > 0) ?? "";
  if (!firstLine) return [];
  const usable = Number.isFinite(cols) ? cols : 80;
  const primary = Math.min(80, Math.max(16, usable - 12));
  const widths = [primary, Math.min(32, primary), Math.min(16, primary)];
  const keys: string[] = [];
  for (const width of widths) {
    const key = firstLine.slice(0, width);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}
