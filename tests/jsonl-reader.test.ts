import { mkdtemp, appendFile, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonlReader, maxJsonlLineBytes } from "../src/main/jsonl-reader.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
async function fixture(content: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "sharkbay-jsonl-")); directories.push(dir);
  const file = path.join(dir, "session.jsonl"); await writeFile(file, content); return file;
}
async function collect(reader: JsonlReader, end = Infinity, signal?: AbortSignal) {
  const lines = []; for await (const line of reader.read(end, signal)) lines.push(line); return lines;
}
describe("bounded JSONL reads", () => {
  it("preserves UTF-8, CRLF byte offsets and unfinished records across appends", async () => {
    const first = " ".repeat(65535) + "中文\r\n";
    const file = await fixture(first + '{"partial":'); const reader = new JsonlReader(file);
    expect(await collect(reader)).toEqual([{ line: first.slice(0, -2), offset: 0 }]);
    await appendFile(file, "true}\nnext\n");
    expect(await collect(reader)).toEqual([
      { line: '{"partial":true}', offset: Buffer.byteLength(first) },
      { line: "next", offset: Buffer.byteLength(first + '{"partial":true}\n') },
    ]);
  });
  it("bounds a huge unfinished line and resumes at the following record", async () => {
    const file = await fixture(""); const handle = await open(file, "r+");
    await handle.truncate(128 * 1024 * 1024); await handle.close();
    const reader = new JsonlReader(file);
    expect(await collect(reader)).toEqual([]);
    expect(reader.bufferedBytes).toBeLessThanOrEqual(maxJsonlLineBytes);
    await appendFile(file, "\nvalid\n");
    expect(await collect(reader)).toEqual([{ line: null, offset: 0 }, { line: "valid", offset: 128 * 1024 * 1024 + 1 }]);
  });
  it("honors a snapshot boundary and cancellation without consuming later data", async () => {
    const file = await fixture("one\ntwo\n"); const reader = new JsonlReader(file);
    expect(await collect(reader, 4)).toEqual([{ line: "one", offset: 0 }]);
    const controller = new AbortController(); controller.abort();
    expect(await collect(reader, Infinity, controller.signal)).toEqual([]);
    expect(await collect(reader)).toEqual([{ line: "two", offset: 4 }]);
  });
});
