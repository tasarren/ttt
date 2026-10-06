/**
 * End-to-end for @ttt/tmux on a private tmux server (own socket, never the developer's session).
 * Every assertion reads real tmux state back through a second, independent `tmux -L` call.
 */
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { after, before, test } from "node:test"
import { promisify } from "node:util"

import { DEFAULT_TMUX_OPTIONS, OptionScope, SplitDirection, Tmux, TmuxError, TmuxFailure, UserOption, WaitOutcome, createRunner, previousKey } from "../src/index.ts"

const execFileAsync = promisify(execFile)
const SOCKET = `ttt-tmux-e2e-${process.pid}`
const SESSION = "work"

async function raw(...args: string[]): Promise<string> {
  return (await execFileAsync("tmux", ["-L", SOCKET, ...args])).stdout
}

const tmux = new Tmux(
  { ...DEFAULT_TMUX_OPTIONS, inputSettleMs: 50, postPasteMs: 50, enterPresses: 1, postSendMs: 50 },
  createRunner({ socket: SOCKET }),
)

before(async() => {
  await raw("new-session", "-d", "-s", SESSION, "-n", "A", "-x", "160", "-y", "40", "sh")
})

after(async() => {
  await raw("kill-server").catch(() => undefined)
})

test("requireVersion accepts the installed tmux and rejects an impossible minimum", async() => {
  await tmux.requireVersion()
  await assert.rejects(tmux.requireVersion([99, 0]), (error: unknown) => {
    assert.ok(error instanceof TmuxError)
    assert.match(error.message, /too old; ttt tmux needs 99\.0/)
    return true
  })
})

test("inventory lists sessions, windows, and panes with the ids tmux reports", async() => {
  const sessions = await tmux.inventory.listSessions()
  assert.deepEqual(sessions.map((session) => [session.name, session.attached]), [[SESSION, false]])
  assert.equal(await tmux.inventory.hasSession(SESSION), true)
  assert.equal(await tmux.inventory.hasSession("nope"), false)

  const windows = await tmux.inventory.listWindows(SESSION)
  assert.equal(windows.length, 1)
  assert.equal(windows[0]!.name, "A")
  assert.match(windows[0]!.id, /^@\d+$/)

  const panes = await tmux.inventory.listAllPanes()
  const pane = panes.find((candidate) => candidate.windowId === windows[0]!.id)
  assert.ok(pane)
  assert.equal(pane.session, SESSION)
  assert.equal(pane.window, "A")
  assert.equal(pane.pid, Number((await raw("display-message", "-p", "-t", pane.pane, "#{pane_pid}")).trim()))
})

test("windows.open creates a detached named window and windows.find resolves it by name", async() => {
  const { windowId, paneId } = await tmux.windows.open({ session: SESSION, name: "B", command: "sh" })
  assert.match(windowId, /^@\d+$/)
  assert.match(paneId, /^%\d+$/)
  assert.equal((await raw("display-message", "-p", "-t", windowId, "#{window_name}")).trim(), "B")
  assert.equal((await raw("display-message", "-p", "-t", SESSION, "#{window_name}")).trim(), "A", "-d leaves the active window alone")
  const found = await tmux.windows.find(SESSION, "B")
  assert.deepEqual(found, { name: "B", id: windowId })
})

test("panes.split adds a pane in the asked direction and panes.kill removes it", async() => {
  const window = (await tmux.windows.find(SESSION, "B"))!
  const paneId = await tmux.panes.split({ target: window.id, direction: SplitDirection.Horizontal, sizePercent: 30, command: "sh" })
  const layout = (await raw("display-message", "-p", "-t", window.id, "#{window_layout}")).trim()
  assert.match(layout, /\{/, "a horizontal split produces a {left,right} layout")
  const width = Number((await raw("display-message", "-p", "-t", paneId, "#{pane_width}")).trim())
  assert.ok(width > 40 && width < 60, `30% of 160 columns, got ${width}`)
  await tmux.panes.kill(paneId)
  const remaining = (await tmux.inventory.listAllPanes()).filter((pane) => pane.windowId === window.id)
  assert.equal(remaining.length, 1)
})

test("tree nests panes under windows with cwd, command, and dead state", async() => {
  const tree = await tmux.inventory.tree(SESSION)
  assert.equal(tree.name, SESSION)
  assert.deepEqual(tree.windows.map((window) => window.name), ["A", "B"])
  const paneA = tree.windows[0]!.panes[0]!
  assert.equal(paneA.dead, false)
  assert.equal(paneA.command, "sh")
  assert.ok(paneA.cwd.startsWith("/"))
  await assert.rejects(tmux.inventory.tree("nope"), /session does not exist/)
})

test("input.sendText lands in the pane and input.type pastes without Enter", async() => {
  const window = (await tmux.windows.find(SESSION, "B"))!
  await tmux.input.sendText(window.id, "echo split-ok")
  await sleep(300)
  const shown = await tmux.screen.capture(window.id, 20, true)
  assert.match(shown, /^split-ok$/m)

  await tmux.input.type(window.id, "echo typed-only")
  await sleep(200)
  const typed = await tmux.screen.capture(window.id, 20, true)
  assert.match(typed, /echo typed-only/)
  assert.doesNotMatch(typed, /^typed-only$/m, "no Enter was pressed")
  await tmux.input.press(window.id, "C-u")
  assert.equal((await raw("list-buffers")).trim(), "", "private buffers are always deleted")
})

test("sendText brackets multiline text and special characters before the submit key", async() => {
  // A real raw-mode terminal reader: enables the same paste mode as a TUI and reports received bytes.
  const reader = `
    process.stdin.setRawMode(true)
    let bytes = Buffer.alloc(0)
    process.stdin.on("data", (chunk) => {
      bytes = Buffer.concat([bytes, chunk])
      process.stdout.write("\\r\\nreceived:" + bytes.toString("hex") + "\\r\\n")
    })
    process.stdout.write("\\x1b[?2004hready\\r\\n")
  `
  const { windowId, paneId } = await tmux.windows.open({
    session: SESSION,
    name: "PASTE",
    command: `"${process.execPath}" -e '${reader}'`,
  })
  try {
    assert.equal((await tmux.screen.waitFor({ target: paneId, pattern: /^ready$/, timeoutMs: 5_000, pollMs: 50 })).outcome, WaitOutcome.Matched)
    const text = "Let's resume!!\n\nKeep \"quotes\" and `backticks` literal."
    await tmux.input.sendText(paneId, text, { quiet: false })
    // tmux's default paste separator converts LF to CR, inside the bracketed-paste delimiters.
    const expected = Buffer.from(`\x15\x1b[200~${text.replaceAll("\n", "\r")}\x1b[201~\r`).toString("hex")
    const received = await tmux.screen.waitFor({ target: paneId, pattern: new RegExp(`received:${expected}`), timeoutMs: 5_000, pollMs: 50 })
    assert.equal(received.outcome, WaitOutcome.Matched, "body is enclosed in paste delimiters; Enter follows the closing delimiter")
  } finally {
    await tmux.windows.close(windowId)
  }
})

test("screen.waitFor resolves when a line appears and times out otherwise", async() => {
  const window = (await tmux.windows.find(SESSION, "B"))!
  const waiting = tmux.screen.waitFor({ target: window.id, pattern: /^waited-for$/, timeoutMs: 5_000, pollMs: 50 })
  await tmux.input.sendText(window.id, "sleep 0.3; echo waited-for")
  const result = await waiting
  assert.equal(result.outcome, WaitOutcome.Matched)
  assert.equal(result.line, "waited-for")
  const missed = await tmux.screen.waitFor({ target: window.id, pattern: /never-printed/, timeoutMs: 200, pollMs: 50 })
  assert.equal(missed.outcome, WaitOutcome.TimedOut)
})

test("options pin/restore round-trips a builtin window option and a pane user option", async() => {
  const window = (await tmux.windows.find(SESSION, "B"))!
  const rename = { scope: OptionScope.Window, target: window.id, key: "allow-rename" } as const
  assert.equal(await tmux.options.get(rename), undefined, "not explicitly set on the window yet")
  await tmux.options.pin(rename, "off")
  assert.equal((await raw("show-options", "-w", "-v", "-t", window.id, "allow-rename")).trim(), "off")
  assert.equal((await raw("show-options", "-w", "-v", "-t", window.id, previousKey("allow-rename"))).trim(), "<unset>")
  assert.equal(await tmux.options.restore(rename), true)
  assert.equal(await tmux.options.get(rename), undefined)

  const paneId = (await tmux.inventory.listAllPanes()).find((pane) => pane.windowId === window.id)!.pane
  const agent = { scope: OptionScope.Pane, target: paneId, key: UserOption.Agent } as const
  await tmux.options.set(agent, "B")
  assert.equal((await raw("display-message", "-p", "-t", paneId, `#{${UserOption.Agent}}`)).trim(), "B")
  await tmux.options.unset(agent)
  assert.equal(await tmux.options.get(agent), undefined)
})

test("hooks set/list/unset are session-scoped", async() => {
  await tmux.hooks.set(SESSION, "after-new-window", "display-message hooked")
  const hooks = await tmux.hooks.list(SESSION)
  assert.deepEqual(hooks, [{ name: "after-new-window", command: "display-message hooked" }])
  assert.equal((await raw("show-hooks", "-g")).includes("hooked"), false, "never written globally")
  await tmux.hooks.unset(SESSION, "after-new-window")
  assert.deepEqual(await tmux.hooks.list(SESSION), [])
})

test("failures carry the tmux code: no_target, pane_dead, no_client", async() => {
  await assert.rejects(tmux.windows.close("@999"), (error: unknown) => {
    assert.ok(error instanceof TmuxError)
    assert.equal(error.code, TmuxFailure.NoTarget)
    return true
  })

  const { paneId } = await tmux.windows.open({ session: SESSION, name: "DEAD", command: "sh" })
  await tmux.options.set({ scope: OptionScope.Window, target: paneId, key: "remain-on-exit" }, "on")
  await raw("send-keys", "-t", paneId, "exit", "Enter")
  await sleep(300)
  assert.equal(await tmux.panes.isDead(paneId), true)
  await assert.rejects(tmux.input.type(paneId, "x"), (error: unknown) => {
    assert.ok(error instanceof TmuxError)
    assert.equal(error.code, TmuxFailure.PaneDead)
    return true
  })
  await tmux.panes.respawn(paneId, "sh")
  assert.equal(await tmux.panes.isDead(paneId), false)

  await assert.rejects(tmux.screen.popup({ session: SESSION, command: "true" }), (error: unknown) => {
    assert.ok(error instanceof TmuxError)
    assert.equal(error.code, TmuxFailure.NoClient)
    return true
  })
  await tmux.screen.refreshStatus(SESSION)
})
