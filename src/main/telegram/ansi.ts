/**
 * Terminal-output cleanup for Telegram rendering (spec §7 "ANSI 清洗").
 *
 * Independent pure function — does not depend on terminal.ts internals. Removes
 * ANSI escape sequences (CSI / OSC / single-char), applies carriage-return and
 * backspace line editing so progress redraws collapse to readable text, and keeps
 * newlines intact.
 */

const ESC = "\u001b";
const BEL = "\u0007";

/** Strip escape sequences and apply CR/BS line editing. Newlines are preserved. */
export function stripAnsi(input: string): string {
  const withoutEscapes = removeEscapeSequences(input);
  return applyLineEditing(withoutEscapes);
}

function removeEscapeSequences(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; ) {
    const ch = value[i]!;
    if (ch === ESC) {
      i = skipEscapeSequence(value, i);
      continue;
    }
    // Drop other C0 control chars except \t \n \r and BS (handled later).
    const code = value.charCodeAt(i);
    if (code < 0x20 && ch !== "\t" && ch !== "\n" && ch !== "\r" && ch !== "\b") {
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Advance past an escape sequence starting at `start` (index of ESC). */
function skipEscapeSequence(value: string, start: number): number {
  let i = start + 1;
  const next = value[i];
  // CSI: ESC [ ... <final byte 0x40-0x7e>
  if (next === "[") {
    i += 1;
    while (i < value.length) {
      const code = value.charCodeAt(i);
      i += 1;
      if (code >= 0x40 && code <= 0x7e) break;
    }
    return i;
  }
  // OSC: ESC ] ... (BEL | ESC \)
  if (next === "]") {
    i += 1;
    while (i < value.length) {
      if (value[i] === BEL) return i + 1;
      if (value[i] === ESC && value[i + 1] === "\\") return i + 2;
      i += 1;
    }
    return value.length;
  }
  // Other escapes (e.g. ESC = , ESC > , charset selectors): skip 1-2 chars.
  return Math.min(value.length, i + 1);
}

/** Apply backspace and carriage-return rewrites per line, then drop trailing blank lines. */
function applyLineEditing(value: string): string {
  const lines: string[] = [];
  let column = 0;
  let line = "";

  const commitLine = () => {
    lines.push(line);
    line = "";
    column = 0;
  };

  for (const ch of value) {
    if (ch === "\n") {
      commitLine();
      continue;
    }
    if (ch === "\r") {
      column = 0;
      continue;
    }
    if (ch === "\b") {
      if (column > 0) column -= 1;
      continue;
    }
    if (ch === "\t") {
      // Expand tab to a single space for messaging.
      if (column < line.length) {
        line = line.slice(0, column) + " " + line.slice(column + 1);
      } else {
        line += " ";
      }
      column += 1;
      continue;
    }
    if (column < line.length) {
      line = line.slice(0, column) + ch + line.slice(column + 1);
    } else {
      line += ch;
    }
    column += 1;
  }
  commitLine();

  // Trim trailing whitespace per line and drop trailing empty lines.
  const trimmed = lines.map((l) => l.replace(/\s+$/u, ""));
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") trimmed.pop();
  return trimmed.join("\n");
}
