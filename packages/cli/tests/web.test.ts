import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Board } from "@ttt/board"
import { createWebApp, actionArgs } from "../src/web.ts"
import { defaultSettings } from "../src/settings.ts"

test("local Webapp validates requests and preserves JSONC with conflict protection", async() => {
  const home = await mkdtemp(join(tmpdir(), "ttt-web-"))
  const source = "{\n  // human comment\n  \"notifySeconds\": 5\n}\n"
  await writeFile(join(home, "settings.jsonc"), source)
  const settings = defaultSettings(home)
  const board = new Board({ sessionRoot: join(settings.boardRoot, "probe"), notifySeconds: settings.notifySeconds, lock: settings.lock })
  for (let index = 0; index < 55; index++) await board.send("sender", ["recipient"], `body ${index}`, { kind: "message", replyExpected: false, priority: index === 0 ? "urgent" : "normal" })
  const host = await createWebApp(settings, { socket: `ttt-web-${process.pid}` })
  try {
    const state = await host.state(new URL("http://127.0.0.1/boards"))
    assert.equal(state.page.total, 55)
    assert.equal(state.board?.messages.length, 50)
    const second = await host.state(new URL("http://127.0.0.1/boards/probe?offset=50"))
    assert.equal(second.board?.messages.length, 5)
    assert.ok(second.board.messages.every(message => !state.board?.messages.some(first => first.messageId === message.messageId)))
    const urgent = await host.state(new URL("http://127.0.0.1/boards/probe?urgent=1"))
    assert.equal(urgent.page.total, 1)
    assert.equal((await host.state(new URL("http://127.0.0.1/sessions"))).board, null)
    assert.equal((await host.app.request("http://evil.test/api/state")).status, 403)
    assert.equal((await host.app.request("http://127.0.0.1/api/actions", { method: "POST", headers: { Origin: "http://evil.test", "Content-Type": "application/json" }, body: "{}" })).status, 403)
    const headers = { Origin: "http://127.0.0.1", "Content-Type": "application/json", "X-TTT-Token": state.token }
    assert.equal((await host.app.request("http://127.0.0.1/api/input", { method: "POST", headers, body: JSON.stringify({ session: "probe", pane: "%1", data: "x", arbitrary: true }) })).status, 400)
    assert.equal((await host.app.request("http://127.0.0.1/api/actions", { method: "POST", headers, body: JSON.stringify({ action: "close", session: "probe", arbitrary: true }) })).status, 400)
    const next = source.replace(": 5", ": 6")
    const result = await host.app.request("http://127.0.0.1/api/settings", { method: "PUT", headers, body: JSON.stringify({ source: next, etag: state.settings.etag }) })
    assert.equal(result.status, 200)
    assert.equal(await readFile(join(home, "settings.jsonc"), "utf8"), next)
    assert.equal((await host.app.request("http://127.0.0.1/api/settings", { method: "PUT", headers, body: JSON.stringify({ source, etag: state.settings.etag }) })).status, 409)
    const latest = await host.state(new URL("http://127.0.0.1/settings"))
    const concurrent = await Promise.all([7, 8].map(async value => host.app.request("http://127.0.0.1/api/settings", { method: "PUT", headers, body: JSON.stringify({ source: source.replace(": 5", `: ${value}`), etag: latest.settings.etag }) })))
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409])
    assert.deepEqual(actionArgs({ action: "open-pane", session: "probe", target: "window", command: "printf '$not_shell_expanded'" }), ["open", "--pane", "", "--in", "window", "--", "printf '$not_shell_expanded'"])
  } finally { host.close(); await rm(home, { recursive: true, force: true }) }
})
