import { open } from "node:fs/promises";

const readChunkBytes = 64 * 1024;
export const maxJsonlLineBytes = 4 * 1024 * 1024;

/** Retains partial records across polls, with bounded reads and line storage. */
export class JsonlReader {
  private parts: Buffer[] = [];
  private dropping = false;
  bufferedBytes = 0;
  lineOffset: number;
  constructor(private readonly file: string, public offset = 0) { this.lineOffset = offset; }

  async *read(end = Infinity, signal?: AbortSignal): AsyncGenerator<{ line: string | null; offset: number }> {
    if (signal?.aborted) return;
    const handle = await open(this.file, "r");
    try {
      while (this.offset < end && !signal?.aborted) {
        const buffer = Buffer.alloc(Math.min(readChunkBytes, end - this.offset));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, this.offset);
        if (!bytesRead) break;
        const blockOffset = this.offset;
        let start = 0;
        for (let index = 0; index < bytesRead; index++) {
          if (buffer[index] !== 10) continue;
          this.append(buffer.subarray(start, index));
          const line = this.dropping ? null : Buffer.concat(this.parts, this.bufferedBytes).toString("utf8").replace(/\r$/, "");
          const offset = this.lineOffset;
          this.lineOffset = blockOffset + index + 1;
          this.offset = this.lineOffset;
          this.parts = []; this.bufferedBytes = 0; this.dropping = false;
          start = index + 1;
          yield { line, offset };
          if (signal?.aborted) return;
        }
        this.append(buffer.subarray(start, bytesRead));
        this.offset = blockOffset + bytesRead;
      }
    } finally { await handle.close(); }
  }

  private append(part: Buffer): void {
    if (this.dropping || !part.length) return;
    if (this.bufferedBytes + part.length > maxJsonlLineBytes) {
      this.parts = []; this.bufferedBytes = 0; this.dropping = true;
    } else {
      this.parts.push(part); this.bufferedBytes += part.length;
    }
  }
}
