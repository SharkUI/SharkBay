import http from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { WebSocketServer, WebSocket } from "ws";
import type { ApplicationRuntime } from "../runtime/application-runtime.js";
import { ApplicationError, maxPromptAttachmentTotalBytes, maxPromptAttachments, maxPromptImageBytes, promptAttachmentImageType, promptAttachmentSizeError, promptImageTypes, runtimeCapabilities, type ApplicationResponse } from "../shared/application-api.js";
import { applicationEvents } from "../shared/application-events.js";
import { isPathInside } from "../main/path-safety.js";
import { SessionAuth } from "./session-auth.js";

type Client = { id: string; session: string; address: string | undefined; socket: WebSocket; alive: boolean };
type AttachmentClient = { id: string; cacheScope: string; assertConnected: () => void };
const maxBody = 2 * 1024 * 1024;
const pngSignature = Buffer.from("89504e470d0a1a0a", "hex");
const jpegSignature = Buffer.from("ffd8ff", "hex");
const compress = promisify(gzip);
const maxClientQueue = 2 * 1024 * 1024;
const eventNames = new Set<string>(Object.values(applicationEvents));
const contentTypes: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2" };

export async function createWebServer(runtime: ApplicationRuntime, options: {
  port: number;
  staticRoot: string;
  host?: "127.0.0.1" | "0.0.0.0";
  isReady?: () => boolean;
}) {
  const auth = new SessionAuth();
  const clients = new Map<string, Client>();
  const desktopAttachmentClients = new Map<string, string>();
  const requests = new Map<string, { body: string; promise: Promise<unknown>; expires: number }>();
  const ws = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024, perMessageDeflate: false });
  const staticRoot = await realpath(options.staticRoot);
  let origin = "";
  let disposed = false;
  let attachmentDirectory: Promise<string> | undefined;
  const send = (client: Client, value: unknown) => {
    if (client.socket.readyState !== WebSocket.OPEN) return;
    try { auth.authenticate(`sharkbay_session=${client.session}`, client.address); }
    catch { client.socket.close(4001, "Authorization expired or revoked"); return; }
    const encoded = JSON.stringify(value);
    if (client.socket.bufferedAmount + Buffer.byteLength(encoded) > maxClientQueue) { client.socket.terminate(); return; }
    client.socket.send(encoded);
  };
  const server = http.createServer((req, res) => {
    if (options.isReady?.() === false) {
      res.writeHead(503).end();
      return;
    }
    void handle(req, res);
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;

  function checkHost(req: http.IncomingMessage): void {
    if (req.headers.host !== new URL(`http://${req.socket.localAddress}:${req.socket.localPort}`).host) throw new ApplicationError("INVALID_HOST", "Unexpected Host", 403);
  }
  function checkOrigin(req: http.IncomingMessage): void {
    if (req.headers.origin !== `http://${req.headers.host}`) throw new ApplicationError("INVALID_ORIGIN", "Cross-site requests are not allowed", 403);
  }
  function json(res: http.ServerResponse, status: number, value: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify(value));
  }
  async function body(req: http.IncomingMessage): Promise<unknown> {
    if (!req.headers["content-type"]?.startsWith("application/json")) throw new ApplicationError("INVALID_CONTENT_TYPE", "JSON is required", 415);
    const data = await readBytes(req, maxBody);
    try { return JSON.parse(data.toString("utf8")); }
    catch { throw new ApplicationError("INVALID_JSON", "Invalid JSON"); }
  }
  async function readBytes(req: http.IncomingMessage, limit: number): Promise<Buffer> {
    if (Number(req.headers["content-length"]) > limit) throw new ApplicationError("REQUEST_TOO_LARGE", "Request is too large", 413);
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const part of req.iterator({ destroyOnReturn: false })) {
      const chunk = Buffer.from(part); size += chunk.length;
      if (size > limit) throw new ApplicationError("REQUEST_TOO_LARGE", "Request is too large", 413);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, size);
  }
  function assertConnected(req: http.IncomingMessage, client: Client): void {
    auth.authenticate(req.headers.cookie, req.socket.remoteAddress);
    if (clients.get(client.id) !== client || client.socket.readyState !== WebSocket.OPEN) throw new ApplicationError("CLIENT_NOT_CONNECTED", "Wait for the runtime connection to recover", 409);
  }
  function cachedRequest(key: string, body: string, execute: () => Promise<unknown>, retryFailures = false): Promise<unknown> {
    const now = Date.now();
    for (const [id, request] of requests) if (request.expires <= now) requests.delete(id);
    const existing = requests.get(key);
    if (existing) {
      if (existing.body !== body) throw new ApplicationError("REQUEST_ID_REUSED", "Request identifier was reused with different input", 409);
      return existing.promise;
    }
    if (requests.size >= 512) throw new ApplicationError("REQUEST_LIMIT", "Too many pending/recent commands; try later", 429);
    const entry = { body, promise: execute(), expires: Infinity };
    requests.set(key, entry);
    void entry.promise.then(() => { entry.expires = Date.now() + 300000; }, () => {
      if (retryFailures) requests.delete(key);
      else entry.expires = Date.now() + 300000;
    });
    return entry.promise;
  }
  async function writeCodexAttachments(client: AttachmentClient, sessionId: string, files: { name: string; type: string; data: Buffer }[], prompt?: string): Promise<void> {
    const attachments = files.map(({ name, type, data }, index) => {
      const basename = path.basename(name.replaceAll("\\", "/")).replace(/[\u0000-\u001f\u007f]/g, "_");
      const extension = path.extname(basename).toLowerCase();
      const imageType = promptAttachmentImageType(name, type);
      const png = imageType === "image/png";
      const jpeg = imageType === "image/jpeg";
      const signature = png ? pngSignature : jpeg ? jpegSignature : null;
      if (signature && !data.subarray(0, signature.length).equals(signature)) throw new ApplicationError("INVALID_IMAGE", "Image data is not a PNG or JPEG image", 415);
      const filename = basename && Buffer.byteLength(basename) <= 220 ? basename : `attachment${extension.length <= 12 ? extension : ""}`;
      return { data, image: !!signature, name: `${index + 1}-${png ? "image.png" : jpeg ? "image.jpg" : filename}` };
    });
    client.assertConnected();
    runtime.terminals.assertControl(sessionId, client.id);
    attachmentDirectory ??= mkdtemp(path.join(tmpdir(), "sharkbay-attachments-")).catch((error) => { attachmentDirectory = undefined; throw error; });
    const directory = await mkdtemp(path.join(await attachmentDirectory, "prompt-"));
    try {
      const imagePaths: string[] = [], filePaths: string[] = [];
      for (const { name, data, image } of attachments) {
        const filePath = path.join(directory, name);
        await writeFile(filePath, data, { mode: 0o600, flag: "wx" });
        (image ? imagePaths : filePaths).push(filePath);
      }
      client.assertConnected();
      runtime.terminals.assertControl(sessionId, client.id);
      if (!runtime.terminals.acceptsBracketedPaste(sessionId)) throw new ApplicationError("TERMINAL_NOT_READY", "Wait for Codex to finish opening, then try again", 409);
      // Codex attaches images from pasted file URLs. Other files are referenced by their host paths.
      const paste = (text: string) => `\x1b[200~${text.replaceAll("\x1b[201~", "")}\x1b[201~`;
      const imageInput = imagePaths.map((imagePath) => paste(pathToFileURL(imagePath).href)).join("");
      const references = filePaths.length ? `Attached files (local paths):\n${filePaths.map((filePath) => `- ${JSON.stringify(filePath)}`).join("\n")}` : "";
      const text = [prompt, references].filter(Boolean).join("\n\n");
      const promptInput = prompt === undefined ? "" : `${text ? paste(text) : ""}\r`;
      if (!await runtime.core.inputTerminal({ sessionId, data: imageInput + promptInput })) {
        throw new ApplicationError("UNKNOWN_TERMINAL", "Terminal session no longer exists", 404);
      }
    } catch (error) {
      await rm(directory, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }
  async function submitAttachmentPrompt(req: http.IncomingMessage, client: AttachmentClient, sessionId: string): Promise<void> {
    const requestId = req.headers["x-sharkbay-request-id"];
    if (typeof requestId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) throw new ApplicationError("INVALID_REQUEST", "Request identifier is required");
    const type = req.headers["content-type"];
    if (!type?.startsWith("multipart/form-data;")) throw new ApplicationError("INVALID_CONTENT_TYPE", "An attachment prompt must be multipart form data", 415);
    const data = await readBytes(req, maxPromptAttachmentTotalBytes + maxBody);
    let form: FormData;
    try { form = await new Response(new Uint8Array(data), { headers: { "Content-Type": type } }).formData(); }
    catch { throw new ApplicationError("INVALID_INPUT", "Could not read the attachment prompt"); }
    const promptValue = form.get("prompt");
    const files = form.getAll("file");
    if (typeof promptValue !== "string" || Buffer.byteLength(promptValue) > maxBody || !files.length || files.length > maxPromptAttachments) {
      throw new ApplicationError("INVALID_INPUT", `Attach between 1 and ${maxPromptAttachments} files and check the prompt length`);
    }
    const prompt = promptValue.replace(/\r\n?/g, "\n");
    const uploadedFiles = files.map((file) => {
      if (typeof file === "string") throw new ApplicationError("INVALID_INPUT", "An attachment file is required");
      return file;
    });
    const sizeError = promptAttachmentSizeError(uploadedFiles);
    if (sizeError) throw new ApplicationError("REQUEST_TOO_LARGE", sizeError, 413);
    const attachments = await Promise.all(uploadedFiles.map(async (file) => ({
      name: file.name, type: file.type, data: Buffer.from(await file.arrayBuffer()),
    })));
    client.assertConnected();
    runtime.terminals.assertControl(sessionId, client.id);
    const digest = createHash("sha256");
    digest.update(JSON.stringify([sessionId, prompt, attachments.map(({ name, type, data }) => [name, type, data.length])]));
    for (const { data } of attachments) digest.update(data);
    await cachedRequest(`attachment-prompt:${client.cacheScope}:${requestId}`, digest.digest("hex"), () => writeCodexAttachments(client, sessionId, attachments, prompt), true);
  }
  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      checkHost(req);
      const requestOrigin = `http://${req.headers.host}`;
      const url = new URL(req.url ?? "/", requestOrigin);
      if (url.pathname.startsWith("/api/")) {
        res.setHeader("Cache-Control", "no-store");
        if (url.pathname === "/api/session" && req.method === "POST") {
          checkOrigin(req);
          const input = await body(req) as { token?: unknown };
          const session = auth.exchange(input?.token, req.socket.remoteAddress ?? "loopback");
          res.setHeader("Set-Cookie", `sharkbay_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
          json(res, 200, { ok: true }); return;
        }
        const session = auth.authenticate(req.headers.cookie, req.socket.remoteAddress);
        if (req.method === "GET" && url.pathname === "/api/preview") {
          const result = await runtime.readPreview(url.searchParams.get("url") ?? "");
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'",
            "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" });
          res.end(result.content); return;
        }
        if (req.method === "GET" && url.pathname === "/api/capabilities") { json(res, 200, runtimeCapabilities); return; }
        const imagePaste = url.pathname === "/api/terminal/clipboard-image";
        const attachmentPrompt = url.pathname === "/api/terminal/attachment-prompt";
        if (req.method !== "POST" || (!imagePaste && !attachmentPrompt && url.pathname !== "/api/command")) throw new ApplicationError("NOT_FOUND", "Unknown API route", 404);
        checkOrigin(req);
        if (req.headers["x-sharkbay-request"] !== "1") throw new ApplicationError("CSRF_REJECTED", "Missing request protection", 403);
        let desktop: AttachmentClient | undefined;
        const token = req.headers["x-sharkbay-attachment-token"];
        if (attachmentPrompt && typeof token === "string" && req.socket.remoteAddress === "127.0.0.1") {
          const id = desktopAttachmentClients.get(token);
          if (id) desktop = {
            id, cacheScope: "desktop",
            assertConnected: () => {
              if (desktopAttachmentClients.get(token) !== id) throw new ApplicationError("CLIENT_NOT_CONNECTED", "Desktop runtime is disconnected", 409);
            },
          };
        }
        const clientId = req.headers["x-sharkbay-client"];
        const candidate = typeof clientId === "string" ? clients.get(clientId) : undefined;
        const client = candidate?.session === session ? candidate : undefined;
        if (imagePaste || attachmentPrompt) {
          const controller = desktop ?? (client && { id: client.id, cacheScope: `web:${session}`, assertConnected: () => assertConnected(req, client) });
          if (!controller) throw new ApplicationError("CLIENT_NOT_CONNECTED", "Wait for the runtime connection to recover", 409);
          const sessionId = url.searchParams.get("sessionId");
          if (!sessionId || sessionId.length > 128) throw new ApplicationError("INVALID_INPUT", "Terminal session is required");
          controller.assertConnected();
          runtime.terminals.assertControl(sessionId, controller.id);
          const terminal = await runtime.requireTerminal(sessionId);
          if (terminal.agentId !== "codex" || terminal.status !== "running") throw new ApplicationError("INVALID_TERMINAL", "Open a running Codex terminal to attach files", 409);
          if (attachmentPrompt) await submitAttachmentPrompt(req, controller, sessionId);
          else {
            const type = req.headers["content-type"];
            if (!type || !promptImageTypes.includes(type)) throw new ApplicationError("INVALID_CONTENT_TYPE", "Paste a PNG or JPEG image", 415);
            await writeCodexAttachments(controller, sessionId, [{ name: "", type, data: await readBytes(req, maxPromptImageBytes) }]);
          }
          json(res, 200, { ok: true }); return;
        }
        if (!client) throw new ApplicationError("CLIENT_NOT_CONNECTED", "Wait for the runtime connection to recover", 409);
        const input = await body(req) as { requestId?: unknown; method?: unknown; input?: unknown };
        if (!input || typeof input.requestId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId) || typeof input.method !== "string") throw new ApplicationError("INVALID_REQUEST", "Invalid command envelope");
        assertConnected(req, client);
        const key = `${session}:${input.requestId}`;
        const encoded = JSON.stringify({ method: input.method, input: input.input });
        const result = await cachedRequest(key, encoded, () => runtime.execute(input.method as string, input.input, client.id));
        json(res, 200, { ok: true, result } satisfies ApplicationResponse);
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") throw new ApplicationError("NOT_FOUND", "Not found", 404);
      let relative: string;
      try { relative = decodeURIComponent(url.pathname); } catch { throw new ApplicationError("NOT_FOUND", "Not found", 404); }
      if (relative === "/") relative = "/index.html";
      let file: string;
      try { file = await realpath(path.join(staticRoot, relative)); }
      catch { throw new ApplicationError("NOT_FOUND", "Not found", 404); }
      if (!isPathInside(staticRoot, file) || !(await stat(file)).isFile()) throw new ApplicationError("NOT_FOUND", "Not found", 404);
      const contentType = contentTypes[path.extname(file)];
      if (!contentType) throw new ApplicationError("NOT_FOUND", "Not found", 404);
      let data = await readFile(file);
      res.setHeader("Cache-Control", /^\/assets\/.+-[\w-]{8}\.[\w]+$/.test(relative) ? "public, max-age=31536000, immutable" : "no-store");
      if (/\.(?:html|js|css|svg)$/.test(file)) {
        res.setHeader("Vary", "Accept-Encoding");
        const acceptsGzip = req.headers["accept-encoding"]?.split(",").some((entry) => {
          const [encoding, ...parameters] = entry.trim().split(";");
          const quality = parameters.find((parameter) => parameter.trim().startsWith("q="));
          return encoding === "gzip" && (quality === undefined || Number(quality.trim().slice(2)) > 0);
        });
        if (data.length >= 1024 && acceptsGzip) {
          data = await compress(data);
          res.setHeader("Content-Encoding", "gzip");
        }
      }
      res.setHeader("Content-Length", data.length);
      res.writeHead(200, { "Content-Type": contentType, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ${requestOrigin.replace("http:", "ws:")}; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'` });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch (error) { replyError(res, error); }
  }
  function replyError(res: http.ServerResponse, error: unknown): void {
    if (res.headersSent) { res.end(); return; }
    const known = error instanceof ApplicationError;
    const message = error instanceof Error ? error.message.slice(0, 500) : "Command failed";
    json(res, known ? error.status : 400, { ok: false, error: { code: known ? error.code : "COMMAND_FAILED", message } } satisfies ApplicationResponse);
  }

  server.on("upgrade", (req, socket, head) => {
    if (options.isReady?.() === false) { socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n"); return; }
    try {
      checkHost(req); checkOrigin(req);
      if (new URL(req.url ?? "/", origin).pathname !== "/api/events") throw new ApplicationError("NOT_FOUND", "Not found", 404);
      const address = req.socket.remoteAddress;
      const session = auth.authenticate(req.headers.cookie, address);
      ws.handleUpgrade(req, socket, head, (connection) => {
        const client: Client = { id: randomUUID(), session, address, socket: connection, alive: true };
        clients.set(client.id, client);
        send(client, { type: "hello", clientId: client.id, capabilities: runtimeCapabilities });
        connection.on("pong", () => { client.alive = true; });
        connection.on("error", () => connection.terminate());
        connection.on("close", () => { clients.delete(client.id); runtime.terminals.releaseClient(client.id); });
        connection.on("message", (raw, binary) => {
          void (async () => {
            auth.authenticate(req.headers.cookie, address);
            if (binary) throw new ApplicationError("INVALID_MESSAGE", "Text messages are required");
            const message = JSON.parse(raw.toString()) as { type?: unknown; sessionId?: unknown; data?: unknown };
            if (!message || typeof message.sessionId !== "string" || message.sessionId.length > 128) throw new ApplicationError("INVALID_MESSAGE", "Invalid terminal message");
            await runtime.requireTerminal(message.sessionId);
            auth.authenticate(req.headers.cookie, address);
            if (clients.get(client.id) !== client || connection.readyState !== WebSocket.OPEN) throw new ApplicationError("CLIENT_NOT_CONNECTED", "Wait for the runtime connection to recover", 409);
            if (message.type === "attach") {
              if (!runtime.terminals.owner(message.sessionId)) runtime.terminals.claim(message.sessionId, client.id);
              await runtime.terminals.attach(message.sessionId, (frame) => send(client, { type: "event", name: "terminal:data", payload: frame }));
              return;
            }
            if (message.type === "input" && typeof message.data === "string" && message.data.length <= 65536) {
              runtime.terminals.assertControl(message.sessionId, client.id);
              await runtime.core.inputTerminal({ sessionId: message.sessionId, data: message.data }); return;
            }
            throw new ApplicationError("INVALID_MESSAGE", "Unsupported terminal message");
          })().catch((error) => send(client, { type: "error", code: error instanceof ApplicationError ? error.code : "INVALID_MESSAGE", message: error instanceof Error ? error.message : "Invalid message" }));
        });
      });
    } catch { socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); }
  });
  const onEvent = (name: string, payload: unknown) => {
    if (!eventNames.has(name)) return;
    for (const client of clients.values()) send(client, { type: "event", name, payload });
  };
  runtime.on("event", onEvent);
  const heartbeat = setInterval(() => {
    for (const client of clients.values()) {
      try { auth.authenticate(`sharkbay_session=${client.session}`, client.address); } catch { client.socket.close(4001, "Authorization expired"); continue; }
      if (!client.alive) { client.socket.terminate(); continue; }
      client.alive = false; client.socket.ping();
    }
  }, 15000);
  heartbeat.unref();
  try {
    await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(options.port, options.host ?? "0.0.0.0", () => { server.off("error", reject); done(); }); });
  } catch (error) { clearInterval(heartbeat); runtime.off("event", onEvent); ws.close(); throw error; }
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to bind local HTTP server");
  origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    openDesktopAttachmentUpload(clientId: string) {
      const token = randomUUID();
      desktopAttachmentClients.set(token, clientId);
      return { token, close: () => desktopAttachmentClients.delete(token) };
    },
    connectionUrl: () => `${origin}/#connect=${auth.issueGrant()}`,
    revoke: () => { auth.revokeAll(); for (const client of clients.values()) if (client.session !== "lan") client.socket.close(4001, "Authorization revoked"); },
    async dispose() {
      if (disposed) return;
      disposed = true; clearInterval(heartbeat); auth.revokeAll();
      runtime.off("event", onEvent);
      for (const client of clients.values()) client.socket.terminate();
      await new Promise<void>((done) => ws.close(() => done()));
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      desktopAttachmentClients.clear();
      if (attachmentDirectory) {
        const directory = await attachmentDirectory.catch(() => undefined);
        if (directory) await rm(directory, { recursive: true, force: true });
      }
    },
  };
}
