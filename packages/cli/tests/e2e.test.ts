/**
 * End-to-end: a private tmux server (own socket, never the developer's session), two windows A and B,
 * and the real CLI run from source with the environment tmux gives a process inside a pane.
 */
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { after, before, test } from "node:test"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const SOCKET = `ttt-e2e-${process.pid}`
const SESSION = "work"
const BIN = new URL("../src/ttt.ts", import.meta.url).pathname

let home = ""
let socketPath = ""
const panes: Record<string, string> = {}

async function tmux(...args: string[]): Promise<string> {
  return (await execFileAsync("tmux", ["-L", SOCKET, ...args])).stdout
}

/** Runs the CLI as if typed inside window `as`. Returns stdout; rejects with stderr on non-zero exit. */
async function ttt(as: string, ...args: string[]): Promise<string> {
  const env = { ...process.env, TTT_HOME: home, TMUX: `${socketPath},0,0`, TMUX_PANE: panes[as]! }
  const { stdout } = await execFileAsync(process.execPath, [BIN, ...args], { env })
  return stdout.trim()
}

async function paneShows(window: string, needle: string, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const text = await tmux("capture-pane", "-p", "-J", "-t", `${SESSION}:${window}`)
    if (text.includes(needle)) return text
    if (Date.now() > deadline) assert.fail(`window ${window} never showed ${JSON.stringify(needle)}:\n${text}`)
    await sleep(200)
  }
}

before(async() => {
  home = await mkdtemp(join(tmpdir(), "ttt-e2e-"))
  await writeFile(join(home, "settings.jsonc"), `{
    // fast timings for the test
    "notifySeconds": 1,
    "tmux": { "inputSettleMs": 50, "postPasteMs": 50, "enterPresses": 1, "postSendMs": 50 },
  }`)
  await tmux("new-session", "-d", "-s", SESSION, "-n", "A", "-x", "160", "-y", "40", "sh")
  await tmux("new-window", "-t", SESSION, "-n", "B", "sh")
  socketPath = (await tmux("display-message", "-p", "#{socket_path}")).trim()
  for (const window of ["A", "B"]) {
    panes[window] = (await tmux("display-message", "-p", "-t", `${SESSION}:${window}`, "#{pane_id}")).trim()
  }
})

after(async() => {
  await tmux("kill-server").catch(() => undefined)
  await rm(home, { recursive: true, force: true })
})

test("normal send: queued, one batched notification, read, ack, status, thread", async() => {
  const queued = await ttt("A", "send", "B", "--", "hello from A")
  const id = /^queued (ttt-\S+) -> B \(notify in ~1s\)$/.exec(queued)?.[1]
  assert.ok(id, `unexpected send output: ${queued}`)
  await ttt("A", "B", "--", "second, via shorthand")

  await paneShows("B", "ttt: 2 new from A(2); 2 unread. Run: ttt read")
  assert.equal(await ttt("B", "inbox", "--count"), "2")

  const batch = await ttt("B", "read")
  assert.match(batch, /^ttt: 2 messages/)
  assert.match(batch, /hello from A/)
  assert.match(batch, /second, via shorthand/)
  assert.match(batch, /0 unread messages remain\.$/)

  assert.equal(await ttt("B", "ack", id, "--", "handled"), `acked ${id}`)
  const status = await ttt("A", "status", id)
  assert.match(status, /^B: acked .*note "handled"/m)

  const reply = await ttt("B", "reply", id, "--", "on it")
  assert.match(reply, new RegExp(`-> A \\(notify in ~1s\\) \\(thread ${id}\\)$`))
  const thread = await ttt("A", "thread", id)
  assert.match(thread, /\(2 messages\)/)
  assert.match(thread, /on it/)

  const days = await readdir(join(home, "boards", SESSION, "messages"))
  assert.equal(days.length, 1, "messages are sharded by day under TTT_HOME/boards/<session>")
})

test("urgent send is pasted immediately and stays unread until read", async() => {
  const sent = await ttt("A", "send", "B", "--urgent", "--no-reply", "--", "stop now")
  assert.match(sent, /^sent URGENT ttt-\S+ -> B$/)
  const pane = await paneShows("B", "URGENT from A [")
  assert.match(pane, /stop now/)
  assert.match(pane, /No reply required\./)
  assert.match(await ttt("B", "read", "--peek"), /stop now/)
})

test("refuses to message itself and unknown windows; capture peeks at the other pane", async() => {
  await assert.rejects(ttt("A", "send", "A", "--", "me"), /refusing to send a message to the current window/)
  await assert.rejects(ttt("A", "send", "ZZZ", "--", "x"), /tmux window does not exist: work:ZZZ/)
  await assert.rejects(ttt("A", "read", "--max", "0"), /--max must be an integer between 1 and 1000/)
  assert.match(await ttt("A", "capture", "B", "--lines", "20"), /URGENT from A/)
})
