import { Ajv2020 } from "ajv/dist/2020.js"
import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { bodyLimit } from "hono/body-limit"
import { createHash, randomUUID } from "node:crypto"
import { watch } from "node:fs"
import { readFile, readdir, mkdir, rename, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { StringDecoder } from "node:string_decoder"
import { Board, assertName, isErrno, withDirectoryLock } from "@ttt/board"
import type { BoardObservation } from "@ttt/board"
import { Tmux, ControlClient, OptionScope, createRunner } from "@ttt/tmux"
import type { TmuxServer } from "@ttt/tmux"
import { parseJsonc, validateContract } from "@ttt/ui"
import type { LayoutFile, SettingsFile, InboxSummary } from "@ttt/ui"
import { WebAction, ACTION_SCHEMA, SOURCE_WRITE_SCHEMA, INPUT_SCHEMA, serializeState } from "@ttt/webapp"
import type { ActionRequest, WebState, TerminalEvent, SourceDocument } from "@ttt/webapp"
import { resolveSettings, readSettingsFile, applySettings, defaultSettings } from "./settings.ts"
import type { Settings } from "./settings.ts"
import { listLayouts, layoutPath, parseLayout } from "./layout.ts"

const validator = new Ajv2020({ allErrors: true })
const validAction = validator.compile<ActionRequest>(ACTION_SCHEMA)
const validSource = validator.compile<Pick<SourceDocument<unknown>, "source" | "etag">>(SOURCE_WRITE_SCHEMA)
const validInput = validator.compile<{ session: string; pane: string; data: string }>(INPUT_SCHEMA)
const execute = promisify(execFile)
const webRoot = fileURLToPath(new URL("../../webapp/", import.meta.url))
const cliPath = fileURLToPath(new URL("./ttt.ts", import.meta.url))
const digest = (text: string): string => createHash("sha256").update(text).digest("hex")
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

/** Local host composition: settings stay CLI-owned; board observation never marks agent mail read. */
export async function createWebApp(initialSettings?: Settings, server: TmuxServer = {}) {
  let settings = initialSettings ?? await resolveSettings()
  const runTmux = createRunner(server)
  let tmux = new Tmux(settings.tmux, runTmux)
  const token = randomUUID()
  let revision = 0
  const boards = new Map<string, Promise<BoardObservation>>()
  const watchers = new Map<string, ReturnType<typeof watch>>()
  const controls = new Set<ControlClient>()
  const invalidate = () => { revision++; boards.clear() }
  function observeRoot(root: string) {
    if (watchers.has(root)) return
    try { watchers.set(root, watch(root, { recursive: true }, invalidate)) }
    catch(error) { if (!isErrno(error, "ENOENT")) throw error }
  }
  observeRoot(settings.home)
  observeRoot(settings.boardRoot)
  let topology = ""
  let polling = false
  let polls = 0
  const timer = setInterval(() => {
    if (polling) return
    polling = true
    if (++polls % 15 === 0) invalidate()
    void tmux.inventory.listAllPanes().then(panes => {
      const current = JSON.stringify(panes)
      if (current !== topology) { topology = current; revision++ }
    }).catch(() => { if (topology) { topology = ""; revision++ } }).finally(() => { polling = false })
  }, 2000)
  timer.unref()

  async function state(url: URL): Promise<WebState> {
    settings = await resolveSettings({ TTT_HOME: settings.home, PATH: settings.path, TMUX_PANE: settings.currentPane })
    tmux = new Tmux(settings.tmux, runTmux)
    observeRoot(settings.home); observeRoot(settings.boardRoot)
    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent)
    const pageName = segments[0] ?? "boards"
    const names = await readdir(settings.boardRoot, { withFileTypes: true }).catch((error: unknown) => {
      if (isErrno(error, "ENOENT")) return []
      throw error
    })
    const boardNames = names.filter(entry => entry.isDirectory() && /^[A-Za-z0-9_-]+$/.test(entry.name)).map(entry => entry.name).sort()
    const sessions = await Promise.all((await tmux.inventory.listSessions()).map(session => tmux.inventory.tree(session.name).catch(() => undefined)))
    const live = sessions.filter((session): session is NonNullable<typeof session> => session !== undefined)
    const selected = segments[1] || (pageName === "sessions" ? live[0]?.name : boardNames[0]) || live[0]?.name
    let board: WebState["board"] = null
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0))
    if (!Number.isSafeInteger(offset)) throw new Error("Invalid page offset")
    const limit = 50
    let total = 0
    if (["boards", "threads", "messages", "agents", "activity"].includes(pageName) && selected && boardNames.includes(selected)) {
      assertName(selected, "board name")
      let observed = boards.get(selected)
      if (!observed) {
        // ponytail: cached full-board scan (~100 ms at 4k messages); add a persistent SQLite archive/FTS replica if query latency grows. Board files stay authoritative.
        observed = new Board({ sessionRoot: join(settings.boardRoot, selected), notifySeconds: settings.notifySeconds, lock: settings.lock }).observe()
        boards.set(selected, observed)
      }
      const source = await observed
      const validMessages = source.messages.filter(value => validateContract("BoardMessage", value).length === 0)
      const validReceipts = source.receipts.filter(value => validateContract("MessageReceipt", value).length === 0)
      const ordered = [...validMessages].sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.messageId.localeCompare(a.messageId))
      let messages = ordered.slice(offset, offset + limit)
      total = ordered.length
      if (pageName === "boards") {
        const query = (url.searchParams.get("q") ?? "").toLowerCase()
        const matching = new Set(ordered.filter(message => `${message.body} ${message.subject ?? ""} ${message.from} ${message.recipients.join(" ")}`.toLowerCase().includes(query)).map(message => message.threadId))
        const urgent = new Set(ordered.filter(message => message.priority === "urgent").map(message => message.threadId))
        const threads = [...new Set(ordered.map(message => message.threadId))].filter(id => matching.has(id) && (url.searchParams.get("urgent") !== "1" || urgent.has(id)))
        total = threads.length
        const ids = threads.slice(offset, offset + limit)
        const visible = new Set(ids)
        for (const id of ids) { const last = ordered.find(message => message.threadId === id); if (last) visible.add(last.messageId) }
        messages = ordered.filter(message => visible.has(message.messageId))
      } else if (pageName === "threads" && segments[2]) {
        const index = source.threads[segments[2]] ?? []
        total = index.length
        const ids = new Set(index.slice(offset, offset + limit))
        messages = validMessages.filter(message => ids.has(message.messageId))
      } else if (pageName === "messages" && segments[2]) messages = validMessages.filter(message => message.messageId === segments[2])
      const ids = new Set(messages.map(message => message.messageId))
      const threadIds = new Set(messages.map(message => message.threadId))
      const summaries: Record<string, InboxSummary> = {}
      for (const receipt of validReceipts) {
        const summary = summaries[receipt.recipient] ?? { unread: 0, read: 0, acked: 0, superseded: 0, cancelled: 0 }
        summary[receipt.state]++
        summaries[receipt.recipient] = summary
      }
      board = { ...source, name: selected, messages, summaries, receipts: validReceipts.filter(receipt => ids.has(receipt.messageId)), threads: Object.fromEntries([...threadIds].map(id => [id, source.threads[id] ?? []])) }
    }
    const layouts: WebState["layouts"] = {}
    for (const name of await listLayouts(settings.home)) {
      const source = await readFile(layoutPath(settings.home, name), "utf8")
      const parsed = parseJsonc<LayoutFile>(source)
      if (!parsed.errors.length && !validateContract("LayoutFile", parsed.value).length && parsed.value) layouts[name] = { source, value: parsed.value, etag: digest(source) }
    }
    const found = await readSettingsFile(settings.home)
    const source = found?.text ?? "{}\n"
    const value = parseJsonc<SettingsFile>(source).value ?? {}
    const geometry: Record<string, string> = {}
    if (pageName === "sessions") for (const session of live) for (const window of session.windows) {
      geometry[window.id] = (await runTmux(["display-message", "-p", "-t", window.id, "#{window_layout}"])).trim()
    }
    let findings: WebState["findings"] = []
    if (pageName === "diagnostics" && selected && live.some(session => session.name === selected)) {
      try {
        const result = await execute(process.execPath, [cliPath, "--session", selected, "tmux", "doctor", "--json"], { maxBuffer: 2_000_000 })
        const parsed: unknown = JSON.parse(result.stdout)
        if (!validateContract("DoctorFindings", parsed).length) findings = parsed as WebState["findings"]
      } catch(error) {
        if (object(error) && typeof error["stdout"] === "string") {
          const parsed: unknown = JSON.parse(error["stdout"])
          if (!validateContract("DoctorFindings", parsed).length) findings = parsed as WebState["findings"]
        }
      }
    }
    const normalized: unknown = JSON.parse(JSON.stringify(live))
    if (!Array.isArray(normalized) || normalized.some((value: unknown) => validateContract("TreeSession", value).length > 0)) throw new Error("Invalid tmux inventory")
    return { boards: boardNames.map(name => ({ name })), board, sessions: normalized as WebState["sessions"], geometry, layouts, settings: { source, value, etag: digest(source) }, harnesses: Object.keys(settings.harnesses.declared), findings, page: { offset, limit, total }, token, revision }
  }

  const app = new Hono()
  app.use("/api/*", bodyLimit({ maxSize: 2_000_000 }))
  app.use("*", async(c, next) => {
    const host = new URL(c.req.url).hostname
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]") { c.res = c.json({ error: "Localhost only" }, 403); return }
    const origin = c.req.header("Origin")
    if (origin && origin !== new URL(c.req.url).origin) { c.res = c.json({ error: "Invalid origin" }, 403); return }
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      if (c.req.header("Origin") !== new URL(c.req.url).origin || c.req.header("X-TTT-Token") !== token) { c.res = c.json({ error: "Invalid request origin or token" }, 403); return }
      if (!c.req.header("Content-Type")?.startsWith("application/json")) { c.res = c.json({ error: "JSON required" }, 415); return }
    }
    await next()
    return
  })
  app.onError((error, c) => c.json({ error: error.message }, 400))
  app.get("/api/state", async c => c.json(await state(new URL(c.req.query("route") || "/boards", c.req.url))))
  app.get("/api/events", c => streamSSE(c, async stream => {
    let seen = -1
    while (!stream.aborted) {
      if (seen !== revision) { seen = revision; await stream.writeSSE({ event: "invalidate", data: String(revision) }) }
      else await stream.writeSSE({ event: "heartbeat", data: "{}" })
      await stream.sleep(2000)
    }
  }))
  async function body(c: { req: { text: () => Promise<string> } }): Promise<Record<string, unknown>> {
    const text = await c.req.text()
    if (Buffer.byteLength(text) > 2_000_000) throw new Error("Request exceeds 2 MB")
    const parsed: unknown = JSON.parse(text)
    if (!object(parsed)) throw new Error("Object required")
    return parsed
  }
  app.put("/api/settings", async c => {
    const request = await body(c)
    if (!validSource(request)) throw new Error("source and etag required; no additional fields allowed")
    const found = await readSettingsFile(settings.home)
    const path = found?.file ?? join(settings.home, "settings.jsonc")
    const source = request["source"]
    const etag = request["etag"]
    const saved = await withDirectoryLock(`${path}.web.lock`, settings.lock, async() => {
      const current = await readSettingsFile(settings.home)
      if (digest(current?.text ?? "{}\n") !== etag || (current && current.file !== path)) return false
      applySettings(defaultSettings(settings.home), path, source)
      await atomicSource(path, source)
      return true
    })
    if (!saved) return c.json({ error: "Settings changed on disk; reload before saving" }, 409)
    invalidate()
    return c.json({ ok: true })
  })
  app.put("/api/layouts/:name", async c => {
    const name = c.req.param("name")
    assertName(name, "layout name")
    const request = await body(c)
    if (!validSource(request)) throw new Error("source and etag required; no additional fields allowed")
    const path = layoutPath(settings.home, name)
    const source = request["source"]
    const etag = request["etag"]
    await mkdir(dirname(path), { recursive: true })
    const saved = await withDirectoryLock(`${path}.web.lock`, settings.lock, async() => {
      const old = await readFile(path, "utf8").catch((error: unknown) => { if (isErrno(error, "ENOENT")) return ""; throw error })
      if ((old ? digest(old) : "") !== etag) return false
      parseLayout(source, path)
      await atomicSource(path, source)
      return true
    })
    if (!saved) return c.json({ error: "Layout changed on disk; reload before saving" }, 409)
    invalidate()
    return c.json({ ok: true })
  })
  app.post("/api/actions", async c => {
    const request = await body(c)
    if (!validAction(request)) throw new Error("Invalid action request")
    const input = request
    assertName(input.session, "session name")
    const args = actionArgs(input)
    const result = await execute(process.execPath, [cliPath, "--session", input.session, "tmux", ...args], { maxBuffer: 2_000_000, timeout: 180_000 })
    revision++
    return c.json({ ok: true, output: result.stdout, warning: result.stderr })
  })
  app.post("/api/input", async c => {
    const request = await body(c)
    if (!validInput(request)) throw new Error("Invalid terminal input")
    const pane = (await tmux.inventory.listAllPanes()).find(pane => pane.session === request["session"] && pane.pane === request["pane"])
    if (!pane) throw new Error("Pane is no longer in this session")
    if (await tmux.panes.isDead(pane.pane)) throw new Error("Pane is dead")
    if (await tmux.options.getEffective({ scope: OptionScope.Window, target: pane.windowId, key: "synchronize-panes" }) === "on") throw new Error("synchronize-panes is on; input would reach every pane")
    await runTmux(["send-keys", "-H", "-t", pane.pane, ...Buffer.from(request["data"], "utf8").toString("hex").match(/../g) ?? []])
    return c.json({ ok: true })
  })
  app.get("/api/terminal", async c => {
    const session = c.req.query("session") ?? ""
    const windowId = c.req.query("window") ?? ""
    assertName(session, "session name")
    const tree = await tmux.inventory.tree(session)
    const window = tree.windows.find(window => window.id === windowId)
    if (!window) throw new Error("Window is no longer in this session")
    return streamSSE(c, async stream => {
      const control = new ControlClient(session, server)
      controls.add(control)
      const epoch = Date.now()
      const decoders = new Map<string, StringDecoder>()
      const ready = new Set<string>()
      const queue: TerminalEvent[] = []
      const lifecycle = { closed: false }
      let queuedBytes = 0
      const enqueue = (event: TerminalEvent) => {
        queuedBytes += JSON.stringify(event).length
        if (queuedBytes > 4_000_000) { lifecycle.closed = true; control.close(); return }
        queue.push(event)
      }
      control.onOutput((pane, bytes) => {
        if (!ready.has(pane)) return
        const text = decoders.get(pane)!.write(bytes)
        if (text) enqueue({ type: "output", pane, epoch, text })
      })
      control.onChange(() => { revision++ })
      control.onError(error => { enqueue({ type: "error", message: error.message }); lifecycle.closed = true })
      stream.onAbort(() => { lifecycle.closed = true; control.close() })
      try {
        await control.show(window.panes.map(pane => pane.pane))
        for (const pane of window.panes) {
          decoders.set(pane.pane, new StringDecoder("utf8"))
          const dimensions = (await control.command(["display-message", "-p", "-t", pane.pane, "#{pane_width} #{pane_height} #{cursor_x} #{cursor_y} #{keypad_cursor_flag}"])).split(" ").map(Number)
          const [cols = 80, rows = 24, x = 0, y = 0, application = 0] = dimensions
          await control.command(["capture-pane", "-p", "-e", "-t", pane.pane, "-S", "0", "-E", String(rows - 1)], text => {
            enqueue({ type: "snapshot", pane: pane.pane, frame: { epoch, cols, rows, text: `\x1b[0m\x1b[H\x1b[2J${text.replace(/\n/g, "\r\n")}\x1b[${y + 1};${x + 1}H${application ? "\x1b[?1h" : "\x1b[?1l"}` } })
            ready.add(pane.pane)
          })
        }
        while (!lifecycle.closed || queue.length) {
          const event = queue.shift()
          if (event) { queuedBytes -= JSON.stringify(event).length; await stream.writeSSE({ data: JSON.stringify(event) }) }
          else await stream.sleep(20)
        }
      } finally { control.close(); controls.delete(control) }
    })
  })
  return { app, state, close: () => { clearInterval(timer); for (const watcher of watchers.values()) watcher.close(); for (const control of controls) control.close() } }
}

async function atomicSource(path: string, source: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp.${process.pid}.${randomUUID()}`
  await writeFile(temporary, source, "utf8")
  await rename(temporary, path)
}

export function actionArgs(input: ActionRequest): string[] {
  const required = (value: string | undefined, label: string): string => { if (!value) throw new Error(`${label} required`); return value }
  switch (input.action) {
    case WebAction.OpenWindow: case WebAction.OpenPane:
      return ["open", ...(input.action === WebAction.OpenWindow ? ["--window", input.name || "auto"] : ["--pane", ...(input.name ? [input.name] : input.harness ? [] : [""]), "--in", required(input.target, "window")]), ...(input.harness ? ["--harness", input.harness] : []), ...(input.cwd ? ["--cwd", input.cwd] : []), ...(input.horizontal ? ["--horizontal"] : []), ...(input.command ? ["--", input.command] : [])]
    case WebAction.Close: case WebAction.Respawn: case WebAction.Interrupt: return [input.action, required(input.target, "target")]
    case WebAction.Rename: return ["rename", required(input.target, "target"), required(input.name, "name")]
    case WebAction.Save: return ["save", required(input.name, "layout name")]
    case WebAction.Restore: return ["restore", required(input.name, "layout name"), "--as", input.session]
    case WebAction.Setup: return ["setup", "--name", input.session, "--non-interactive", ...(input.name ? ["--layout", input.name] : [])]
  }
}

async function start() {
  const host = await createWebApp()
  const dev = process.argv.includes("--dev")
  let renderer: (url: string, state: WebState) => Promise<string>
  let template: () => Promise<string>
  if (dev) {
    const { createServer } = await import("vite")
    const vite = await createServer({ root: webRoot, server: { middlewareMode: true }, appType: "custom" })
    renderer = async(url, state) => {
      const module: unknown = await vite.ssrLoadModule("/src/ssr.ts")
      if (!object(module) || typeof module["render"] !== "function") throw new Error("SSR renderer unavailable")
      return await (module["render"] as (url: string, state: WebState) => Promise<string>)(url, state)
    }
    template = async() => vite.transformIndexHtml("/", await readFile(join(webRoot, "index.html"), "utf8"))
    const { createServer: httpServer } = await import("node:http")
    const { getRequestListener } = await import("@hono/node-server")
    host.app.get("*", async c => {
      const initial = await host.state(new URL(c.req.url))
      const url = new URL(c.req.url)
      return c.html((await template()).replace("<!--app-->", await renderer(url.pathname + url.search, initial)).replace("<!--state-->", `<script id="ttt-state" type="application/json">${serializeState(initial)}</script>`))
    })
    const listener = getRequestListener(host.app.fetch)
    const server = httpServer((request, response) => { vite.middlewares(request, response, () => { void listener(request, response) }) })
    server.listen(3000, "127.0.0.1", () => { process.stdout.write("TTT Webapp http://127.0.0.1:3000\n") })
    process.on("SIGINT", () => { host.close(); server.close(); server.closeAllConnections(); void vite.close() })
  } else {
    const module: unknown = await import(pathToFileURL(join(webRoot, "dist/server/ssr.js")).href)
    if (!object(module) || typeof module["render"] !== "function") throw new Error("SSR renderer unavailable; run pnpm build")
    renderer = module["render"] as (url: string, state: WebState) => Promise<string>
    template = () => readFile(join(webRoot, "dist/client/index.html"), "utf8")
    host.app.get("/assets/*", async c => {
      const path = resolve(webRoot, "dist/client", new URL(c.req.url).pathname.slice(1))
      if (!path.startsWith(join(webRoot, "dist/client/assets") + "/")) return c.notFound()
      const data = await readFile(path)
      c.header("Content-Type", path.endsWith(".css") ? "text/css" : "text/javascript")
      return c.body(data)
    })
    host.app.get("*", async c => {
      const state = await host.state(new URL(c.req.url))
      const url = new URL(c.req.url)
      return c.html((await template()).replace("<!--app-->", await renderer(url.pathname + url.search, state)).replace("<!--state-->", `<script id="ttt-state" type="application/json">${serializeState(state)}</script>`))
    })
    const server = serve({ fetch: host.app.fetch, port: 3000, hostname: "127.0.0.1" })
    process.on("SIGINT", () => { host.close(); server.close(); if ("closeAllConnections" in server) server.closeAllConnections() })
    process.stdout.write("TTT Webapp http://127.0.0.1:3000\n")
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await start()
