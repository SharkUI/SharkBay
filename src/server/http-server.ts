import http from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { ApplicationRuntime } from "../runtime/application-runtime.js";
import { ApplicationError, runtimeCapabilities, type ApplicationResponse } from "../shared/application-api.js";
import { applicationEvents } from "../shared/application-events.js";
import { isPathInside } from "../main/path-safety.js";
import { SessionAuth } from "./session-auth.js";

type Client = { id: string; session: string; socket: WebSocket; alive: boolean };
const maxBody = 2 * 1024 * 1024;
const maxClientQueue = 2 * 1024 * 1024;
const eventNames = new Set<string>(Object.values(applicationEvents));
const contentTypes: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2" };

export async function createWebServer(runtime: ApplicationRuntime, options: { port: number; staticRoot: string }) {
  const auth = new SessionAuth();
  const clients = new Map<string, Client>();
  const requests = new Map<string, { body: string; promise: Promise<unknown>; expires: number }>();
  const ws = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024, perMessageDeflate: false });
  const staticRoot = await realpath(options.staticRoot);
  let origin = "";
  let disposed = false;
  const send = (client: Client, value: unknown) => {
    if (client.socket.readyState !== WebSocket.OPEN) return;
    const encoded = JSON.stringify(value);
    if (client.socket.bufferedAmount + Buffer.byteLength(encoded) > maxClientQueue) { client.socket.terminate(); return; }
    client.socket.send(encoded);
  };
  const server = http.createServer((req, res) => { void handle(req, res); });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;

  function checkHost(req: http.IncomingMessage): void {
    if (req.headers.host !== new URL(origin).host) throw new ApplicationError("INVALID_HOST", "Unexpected Host", 403);
  }
  function checkOrigin(req: http.IncomingMessage): void {
    if (req.headers.origin !== origin) throw new ApplicationError("INVALID_ORIGIN", "Cross-site requests are not allowed", 403);
  }
  function json(res: http.ServerResponse, status: number, value: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify(value));
  }
  async function body(req: http.IncomingMessage): Promise<unknown> {
    if (!req.headers["content-type"]?.startsWith("application/json")) throw new ApplicationError("INVALID_CONTENT_TYPE", "JSON is required", 415);
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const part of req) {
      const chunk = Buffer.from(part); size += chunk.length;
      if (size > maxBody) throw new ApplicationError("REQUEST_TOO_LARGE", "Request is too large", 413);
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new ApplicationError("INVALID_JSON", "Invalid JSON"); }
  }
  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      checkHost(req);
      const url = new URL(req.url ?? "/", origin);
      if (url.pathname.startsWith("/api/")) {
        res.setHeader("Cache-Control", "no-store");
        if (url.pathname === "/api/session" && req.method === "POST") {
          checkOrigin(req);
          const input = await body(req) as { token?: unknown };
          const session = auth.exchange(input?.token, req.socket.remoteAddress ?? "loopback");
          res.setHeader("Set-Cookie", `sharkbay_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
          json(res, 200, { ok: true }); return;
        }
        const session = auth.authenticate(req.headers.cookie);
        if (req.method === "GET" && url.pathname === "/api/preview") {
          const result = await runtime.readPreview(url.searchParams.get("url") ?? "");
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'",
            "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" });
          res.end(result.content); return;
        }
        if (req.method === "GET" && url.pathname === "/api/capabilities") { json(res, 200, runtimeCapabilities); return; }
        if (req.method !== "POST" || url.pathname !== "/api/command") throw new ApplicationError("NOT_FOUND", "Unknown API route", 404);
        checkOrigin(req);
        if (req.headers["x-sharkbay-request"] !== "1") throw new ApplicationError("CSRF_REJECTED", "Missing request protection", 403);
        const clientId = req.headers["x-sharkbay-client"];
        const client = typeof clientId === "string" ? clients.get(clientId) : undefined;
        if (!client || client.session !== session) throw new ApplicationError("CLIENT_NOT_CONNECTED", "Wait for the runtime connection to recover", 409);
        const input = await body(req) as { requestId?: unknown; method?: unknown; input?: unknown };
        if (!input || typeof input.requestId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId) || typeof input.method !== "string") throw new ApplicationError("INVALID_REQUEST", "Invalid command envelope");
        const now = Date.now();
        for (const [key, request] of requests) if (request.expires <= now) requests.delete(key);
        const key = `${session}:${input.requestId}`;
        const encoded = JSON.stringify({ method: input.method, input: input.input });
        let request = requests.get(key);
        if (request && request.body !== encoded) throw new ApplicationError("REQUEST_ID_REUSED", "Request identifier was reused with different input", 409);
        if (!request) {
          if (requests.size >= 512) throw new ApplicationError("REQUEST_LIMIT", "Too many pending/recent commands; try later", 429);
          request = { body: encoded, promise: runtime.execute(input.method, input.input, client.id), expires: Infinity };
          requests.set(key, request);
          const entry = request;
          void request.promise.then(() => { entry.expires = Date.now() + 300000; }, () => { entry.expires = Date.now() + 300000; });
        }
        try { json(res, 200, { ok: true, result: await request.promise } satisfies ApplicationResponse); }
        catch (error) { replyError(res, error); }
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
      const data = await readFile(file);
      res.writeHead(200, { "Content-Type": contentType, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ${origin.replace("http:", "ws:")}; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'` });
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
    try {
      checkHost(req); checkOrigin(req);
      if (new URL(req.url ?? "/", origin).pathname !== "/api/events") throw new ApplicationError("NOT_FOUND", "Not found", 404);
      const session = auth.authenticate(req.headers.cookie);
      ws.handleUpgrade(req, socket, head, (connection) => {
        const client: Client = { id: randomUUID(), session, socket: connection, alive: true };
        clients.set(client.id, client);
        send(client, { type: "hello", clientId: client.id, capabilities: runtimeCapabilities });
        connection.on("pong", () => { client.alive = true; });
        connection.on("error", () => connection.terminate());
        connection.on("close", () => { clients.delete(client.id); runtime.terminals.releaseClient(client.id); });
        connection.on("message", (raw, binary) => {
          void (async () => {
            auth.authenticate(req.headers.cookie);
            if (binary) throw new ApplicationError("INVALID_MESSAGE", "Text messages are required");
            const message = JSON.parse(raw.toString()) as { type?: unknown; sessionId?: unknown; data?: unknown };
            if (!message || typeof message.sessionId !== "string" || message.sessionId.length > 128) throw new ApplicationError("INVALID_MESSAGE", "Invalid terminal message");
            await runtime.requireTerminal(message.sessionId);
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
      try { auth.authenticate(`sharkbay_session=${client.session}`); } catch { client.socket.close(4001, "Authorization expired"); continue; }
      if (!client.alive) { client.socket.terminate(); continue; }
      client.alive = false; client.socket.ping();
    }
  }, 15000);
  heartbeat.unref();
  try {
    await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(options.port, "127.0.0.1", () => { server.off("error", reject); done(); }); });
  } catch (error) { clearInterval(heartbeat); runtime.off("event", onEvent); ws.close(); throw error; }
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to bind local HTTP server");
  origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    connectionUrl: () => `${origin}/#connect=${auth.issueGrant()}`,
    revoke: () => { auth.revokeAll(); for (const client of clients.values()) client.socket.close(4001, "Authorization revoked"); },
    async dispose() {
      if (disposed) return;
      disposed = true; clearInterval(heartbeat); auth.revokeAll();
      runtime.off("event", onEvent);
      for (const client of clients.values()) client.socket.terminate();
      await new Promise<void>((done) => ws.close(() => done()));
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}
