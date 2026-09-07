/**
 * End-to-end: a private tmux server (own socket, never the developer's session), two windows A and B,
 * and the real CLI run from source with the environment tmux gives a process inside a pane.
 */
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
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

/** The `@ttt_unread` badge a window currently carries; empty when unset. */
async function badge(window: string): Promise<string> {
  return (await tmux("display-message", "-p", "-t", `${SESSION}:${window}`, "#{@ttt_unread}")).trim()
}

/** `window` is a window name or a pane id (`%n`); pane ids stay unambiguous once duplicate names exist. */
async function paneShows(window: string, needle: string, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const text = await tmux("capture-pane", "-p", "-J", "-t", window.startsWith("%") ? window : `${SESSION}:${window}`)
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
  assert.match(await ttt("A", "B", "--", "second, via shorthand"), /joins pending batch/)

  await paneShows("B", "ttt: 2 new from A(2); 2 unread. Run: ttt read")
  assert.equal(await ttt("B", "inbox", "--count"), "2")
  assert.equal(await badge("B"), "2", "the sender mirrored B's unread count into @ttt_unread")
  assert.equal(await badge("A"), "", "A has nothing unread, so no badge option at all")

  const batch = await ttt("B", "read")
  assert.equal(await badge("B"), "", "reading clears the badge")
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

test("triage stays unread; bare-note ack and ack --all clear the mailbox", async() => {
  const queued = await ttt("A", "send", "B", "--no-reply", "--", "detail probe body line one\nline two")
  const probeId = /^queued (ttt-\S+) -> B/.exec(queued)?.[1]
  assert.ok(probeId, `unexpected send output: ${queued}`)
  assert.match(await ttt("B", "inbox", "--detail"), /detail probe body line one/)
  assert.doesNotMatch(await ttt("B", "inbox", "--detail"), /line two/)
  const headers = await ttt("B", "read", "--headers-only")
  assert.match(headers, /\(headers; still unread\)/)
  assert.match(headers, /\(no-reply\)/)
  assert.doesNotMatch(headers, /line two/)
  const owed = await ttt("A", "send", "B", "--", "triage reply owed")
  assert.match(owed, /queued ttt-\S+ -> B/)
  assert.match(await ttt("B", "inbox", "--detail"), /\(needs reply\)/)
  const before = await ttt("B", "inbox", "--count")
  assert.ok(Number(before) >= 1, `expected unread, got ${before}`)
  assert.equal(await ttt("B", "ack", probeId, "bare", "note", "words"), `acked ${probeId}`)
  const acked = await ttt("B", "ack", "--all", "--", "batch handled")
  assert.match(acked, /^acked ttt-/m)
  assert.equal(await ttt("B", "inbox", "--count"), "0")
  assert.equal(await ttt("B", "ack", "--all"), "ttt: nothing to ack.")
  await assert.rejects(ttt("B", "prune"), /prune needs --days/)
  assert.match(await ttt("B", "prune", "--days", "30", "--dry-run"), /would prune 0 messages, 0 receipts older than 30 days\./)
  assert.match(await ttt("B", "migrate", "--dry-run"), /session work: v4 -> v7, 0 threads, 2 mailboxes indexed \(dry-run\)\./)
  assert.match(await ttt("B", "migrate"), /session work: v4 -> v7, 0 threads, 2 mailboxes indexed\./)
  assert.match(await ttt("B", "migrate"), /session work: already v7, 0 threads, 0 mailboxes indexed\./)
})

test("subjects tag threads; sender filter and thread triage stay unread", async() => {
  const queued = await ttt("A", "send", "B", "--subject", "launch", "--", "subject probe")
  const rootId = /^queued (ttt-\S+) -> B/.exec(queued)?.[1]
  assert.ok(rootId, `unexpected send output: ${queued}`)
  assert.match(await ttt("B", "inbox", "--detail"), /\(subj: launch; needs reply\)/)
  assert.match(await ttt("B", "inbox", "--detail", "--from", "A"), /subject probe/)
  assert.equal(await ttt("B", "inbox", "--detail", "--from", "ZZZ", "--max", "10").then((out) => out.includes("subject probe") ? "leak" : "clean"), "clean")
  await assert.rejects(ttt("B", "inbox", "--detail", "--from", "../x"), /sender name/)
  await assert.rejects(ttt("B", "inbox", "--from", "A"), /--from needs --detail/)
  const triage = await ttt("B", "thread", rootId, "--headers-only")
  assert.match(triage, /topic: launch members: A, B/)
  assert.match(triage, /\(headers\)/)
  await assert.rejects(ttt("B", "reply", rootId, "--subject", "x", "--", "nope"), /root only/)
  assert.match(await ttt("B", "ack", "--all"), /^acked ttt-/m)
  assert.equal(await ttt("B", "inbox", "--count"), "0")
})

test("group threads converge via reply --to thread", async() => {
  await tmux("new-window", "-t", SESSION, "-n", "C", "sh")
  panes["C"] = (await tmux("display-message", "-p", "-t", `${SESSION}:C`, "#{pane_id}")).trim()
  const queued = await ttt("A", "broadcast", "B", "C", "--subject", "launch", "--", "group probe")
  const rootId = /^queued (ttt-\S+) -> B, C/.exec(queued)?.[1]
  assert.ok(rootId, `unexpected broadcast output: ${queued}`)
  const nested = await ttt("B", "reply", rootId, "--", "b nested")
  assert.match(nested, /-> A \(notify in ~1s\) \(thread /)
  const widened = await ttt("C", "reply", rootId, "--to", "thread", "--", "c widens")
  assert.match(widened, /-> A, B \(notify in ~1s|joins pending batch\) \(thread /)
  await assert.rejects(ttt("C", "reply", rootId, "--to", "everyone", "--", "x"), /--to must be sender, receiver, both, or thread/)
  const batchB = await ttt("B", "read")
  assert.match(batchB, /group probe/)
  assert.match(batchB, /c widens/)
  const thread = await ttt("A", "thread", rootId)
  assert.match(thread, /topic: launch members: A, B, C/)
  assert.match(thread, /b nested/)
  assert.match(thread, /c widens/)
  assert.match(await ttt("A", "ack", "--all", "--", "group done"), /^acked ttt-/m)
  assert.match(await ttt("B", "ack", "--all", "--", "group done"), /^acked ttt-/m)
  assert.match(await ttt("C", "ack", "--all", "--", "group done"), /^acked ttt-/m)
})

test("identity resolves by PID ancestry, never the active window", async() => {
  await assert.rejects(ttt("A", "--from", "ZZZ", "windows"), /--from needs --session/)
  await tmux("send-keys", "-t", `${SESSION}:B`, `TMUX_PANE=%99999 "${process.execPath}" "${BIN}" whoami`, "Enter")
  await paneShows("B", "via: pid-walk")
  await paneShows("B", "window: B")
})

test("override reads are attributed to the detected window", async() => {
  const queued = await ttt("B", "send", "A", "--", "audit probe")
  const id = /^queued (ttt-\S+) -> A/.exec(queued)?.[1]
  assert.ok(id, `unexpected send output: ${queued}`)
  const env = { ...process.env, TTT_HOME: home, TMUX: `${socketPath},0,0`, TMUX_PANE: panes["B"] }
  const out = (await execFileAsync(process.execPath, [BIN, "--session", SESSION, "--from", "A", "read"], { env })).stdout
  assert.match(out, /audit probe/)
  const status = await ttt("B", "status", id)
  assert.match(status, /\bby B\b/)
  assert.match(await ttt("A", "ack", id, "--", "audit done"), new RegExp(`acked ${id}`))
})

test("delivery targets the stamped pane, falls back on death, ignores focus", async() => {
  // A ttt run *inside* the pane (real PID ancestry) stamps @ttt_agent on that pane, never on siblings.
  const newPane = (await tmux("split-window", "-t", `${SESSION}:A`, "-P", "-F", "#{pane_id}", "sh")).trim()
  await tmux("send-keys", "-t", newPane, `TTT_HOME=${home} ${process.execPath} ${BIN} send B -- pane probe`, "Enter")
  await paneShows("A", "queued ttt-")
  const deadline = Date.now() + 5_000
  for (;;) {
    const stamped = (await tmux("display-message", "-p", "-t", newPane, "#{@ttt_agent}")).trim()
    if (stamped === "A") break
    if (Date.now() > deadline) assert.fail(`pane ${newPane} never got stamped @ttt_agent=A (got ${JSON.stringify(stamped)})`)
    await sleep(100)
  }
  assert.equal((await tmux("display-message", "-p", "-t", panes["A"]!, "#{@ttt_agent}")).trim(), "", "the original pane lost any stamp")
  await tmux("kill-pane", "-t", newPane)
  await tmux("clear-history", "-t", `${SESSION}:A`)
  await tmux("send-keys", "-t", `${SESSION}:A`, "clear", "Enter")
  // With the stamped pane gone, delivery falls back to the window's lowest-index pane.
  const probe = await ttt("B", "send", "A", "--no-reply", "--", "fallback probe")
  assert.match(probe, /queued ttt-\S+ -> A/)
  await paneShows("A", "ttt: 1 new from B(1); 1 unread. Run: ttt read")
  // A focused foreign pane must not steal the delivery: unstamped windows land on the lowest index.
  const focusPane = (await tmux("split-window", "-t", `${SESSION}:A`, "-P", "-F", "#{pane_id}", "sh")).trim()
  await tmux("select-pane", "-t", focusPane)
  const focusProbe = await ttt("B", "send", "A", "--no-reply", "--", "focus probe")
  assert.match(focusProbe, /queued ttt-\S+ -> A/)
  const focusDeadline = Date.now() + 10_000
  for (;;) {
    const original = await tmux("capture-pane", "-p", "-t", panes["A"]!)
    if (original.includes("ttt: 1 new from B(1);")) break
    if (Date.now() > focusDeadline) assert.fail(`original pane never showed the focus probe:\n${original}`)
    await sleep(200)
  }
  const focused = await tmux("capture-pane", "-p", "-t", focusPane)
  assert.doesNotMatch(focused, /ttt: 1 new from B\(1\);/)
  // Capture follows the same pane truth: agent pane, never the focused one.
  assert.match(await ttt("B", "capture", "A", "--lines", "20"), /ttt: 1 new from B\(1\);/)
  assert.match(await ttt("A", "ack", "--all", "--", "pane done"), /^acked ttt-/m)
  assert.match(await ttt("B", "ack", "--all", "--", "pane done"), /^acked ttt-/m)
  assert.equal(existsSync(join(home, "boards", SESSION, "state", "panes.json")), false, "no registry file is written anymore")
})

test("refuses to message itself and unknown windows; capture peeks at the other pane", async() => {
  await assert.rejects(ttt("A", "send", "A", "--", "me"), /refusing to send a message to the current window/)
  await assert.rejects(ttt("A", "send", "ZZZ", "--", "x"), /tmux window does not exist: work:ZZZ/)
  await assert.rejects(ttt("A", "read", "--max", "0"), /--max must be an integer between 1 and 1000/)
  assert.match(await ttt("A", "capture", "B", "--lines", "20"), /URGENT from A/)
  assert.match(await ttt("A", "capture", "B", "--lines", "20", "--grep", "stop now"), /stop now/)
  assert.equal(await ttt("A", "capture", "B", "--lines", "20", "--grep", "no-such-line-xyz"), "")
  await assert.rejects(ttt("A", "capture", "B", "--grep", ""), /--grep pattern cannot be empty/)
  const listed = await ttt("A", "windows")
  assert.match(listed, /^A\t@\d+\t\(you\)$/m)
  assert.match(listed, /^B\t@\d+$/m)
  const me = await ttt("A", "whoami")
  assert.match(me, /^session: work$/m)
  assert.match(me, /^window: A$/m)
  assert.match(me, /^id: @\d+$/m)
  assert.match(me, /boards\/work$/m)
  assert.match(me, /^via: pane-env$/m)
  await assert.rejects(ttt("A", "whoami", "extra"), /usage: ttt whoami/)
})

test("capture strips TUI chrome unless --raw", async() => {
  const border = String.fromCharCode(0x2503).repeat(3)
  const marker = "e2e-chrome-42"
  await tmux("send-keys", "-t", `${SESSION}:B`, `printf '%s\\n' '${border}' 'e2e-chrome-42' '${border}'`, "Enter")
  await paneShows("B", marker)
  const near = await ttt("A", "capture", "B", "--lines", "8", "--around", marker, "--context", "1")
  assert.match(near, new RegExp(`^${marker}$`, "m"))
  assert.doesNotMatch(near, new RegExp(`^${border}$`, "m"))
  const nearRaw = await ttt("A", "capture", "B", "--lines", "8", "--raw", "--around", marker, "--context", "1")
  assert.match(nearRaw, new RegExp(`^${border}$`, "m"))
})

test("duplicate names flag the loser; around shows context", async() => {
  await tmux("new-window", "-t", SESSION, "-n", "B", "sh")
  const listed = await ttt("A", "windows")
  assert.match(listed, /^B\t@\d+\t\(dup of @\d+\)$/m)
  assert.match(await ttt("A", "capture", "B", "--lines", "20", "--around", "stop now", "--context", "1"), /stop now/)
  await assert.rejects(ttt("A", "capture", "B", "--grep", "x", "--around", "y"), /cannot be combined/)
})

test("per-window notify overrides change the send receipt", async() => {
  const settings = join(home, "settings.jsonc")
  await writeFile(settings, "{\"notifySeconds\": 1, \"notifyOverrides\": {\"B\": 7}}")
  const queued = await ttt("A", "send", "B", "--", "override probe")
  assert.match(queued, /\(notify in ~7s\)/)
  await writeFile(settings, "{\"notifySeconds\": 1}")
  assert.match(await ttt("A", "send", "B", "--", "backoff probe"), /joins pending batch|notify in ~1s/)
})

test("send --wait returns the reply in-turn and no paste reaches the waiter", async() => {
  await ttt("A", "ack", "--all").catch(() => undefined)
  await ttt("B", "ack", "--all").catch(() => undefined)
  await ttt("A", "read").catch(() => undefined)
  await ttt("B", "read").catch(() => undefined)
  for (const pane of [panes["A"]!, panes["B"]!]) {
    await tmux("clear-history", "-t", pane)
    await tmux("send-keys", "-t", pane, "clear", "Enter")
  }

  // A asks and blocks. Meanwhile B receives a normal notification, reads, replies.
  const asking = ttt("A", "send", "B", "--wait", "--timeout", "20", "--", "what is the answer?")
  const presencePath = join(home, "boards", SESSION, "state", "A.waiting.json")
  const deadline = Date.now() + 5_000
  while (!existsSync(presencePath)) {
    if (Date.now() > deadline) assert.fail("A never announced its presence")
    await sleep(50)
  }
  const waiting = JSON.parse(await readFile(presencePath, "utf8")) as { expect: unknown }
  assert.notEqual(waiting.expect, "any", "A waits on its thread, not on anything")
  await paneShows(panes["B"]!, "ttt: 1 new from A(1); 1 unread. Run: ttt read")
  const batch = await ttt("B", "read")
  const id = /\[1\/1\] A (ttt-\S+)/.exec(batch)?.[1]
  assert.ok(id, batch)
  // While A waits, another message from B and the reply itself must not be pasted into A.
  assert.match(await ttt("B", "send", "A", "--no-reply", "--", "unrelated note"), /\(A waiting: delivered directly\)$/)
  assert.match(await ttt("B", "reply", id, "--", "forty-two"), /\(A waiting: delivered directly\)$/)

  const answer = await asking
  assert.match(answer, /^queued ttt-\S+ -> B \((notify in ~1s|joins pending batch)\)$/m)
  assert.match(answer, /forty-two/, "the reply body is printed in full")
  assert.match(answer, /1 message shown, 1 unread message still unread\./, "honest tail after the reply")
  assert.match(answer, /ttt: 1 message \(headers; still unread\)\n\[1\/1\] B ttt-\S+ \(no-reply\)\n {2}unrelated note/, "the rest of the mailbox as headers")
  await sleep(1_500)
  const screen = await tmux("capture-pane", "-p", "-t", panes["A"]!)
  assert.doesNotMatch(screen, /ttt: \d new from B/, "no notification was pasted into the waiting window")
  assert.doesNotMatch(screen, /URGENT/, "no urgent paste either")
  await assert.rejects(access(presencePath), "presence withdrawn after the wait")
  assert.equal(await ttt("A", "inbox", "--count"), "1", "only the reply was marked read")
})

test("read --wait times out honestly and refuses a mutual wait", async() => {
  await ttt("A", "ack", "--all").catch(() => undefined)
  await ttt("A", "read").catch(() => undefined)
  const idle = await ttt("A", "read", "--wait", "--timeout", "1")
  assert.equal(idle, "ttt: nothing arrived within 1s; 0 unread.")
  await assert.rejects(ttt("A", "read", "--wait", "--timeout", "9999"), /--timeout must be an integer between 1 and 300/)
  await assert.rejects(ttt("A", "read", "--timeout", "5"), /--timeout needs --wait/)
  await assert.rejects(ttt("A", "send", "B", "--wait", "--no-reply", "--", "x"), /--wait needs a reply/)

  // B blocks on a question to A; A must not block on a reply from B in the same thread.
  const bAsks = ttt("B", "send", "A", "--wait", "--timeout", "20", "--", "your turn?")
  await sleep(500)
  const batch = await ttt("A", "read")
  const id = /\[1\/1\] B (ttt-\S+)/.exec(batch)?.[1]
  assert.ok(id, batch)
  await assert.rejects(ttt("A", "reply", id, "--wait", "--", "and you?"), /B is already waiting on a reply from you/)
  assert.match(await ttt("A", "reply", id, "--", "done"), /\(B waiting: delivered directly\)$/)
  assert.match(await bAsks, /done/)
})

test("tmux setup creates a normalized session, the hook normalizes new windows, doctor reads it back", async() => {
  // Outside tmux: no TMUX/TMUX_PANE, private server through TMUX_TMPDIR so nothing touches the developer's.
  const tmpDir = await mkdtemp(join(tmpdir(), "ttt-e2e-tmuxdir-"))
  const env: NodeJS.ProcessEnv = { ...process.env, TTT_HOME: home, TMUX_TMPDIR: tmpDir }
  delete env["TMUX"]
  delete env["TMUX_PANE"]
  const outside = async(...args: string[]): Promise<string> => (await execFileAsync(process.execPath, [BIN, ...args], { env })).stdout.trim()
  const server = async(...args: string[]): Promise<string> => (await execFileAsync("tmux", args, { env })).stdout
  try {
    const created = await outside("tmux", "setup", "--name", "team")
    assert.match(created, /^ttt: session team set up with profile agents: \d+ options? pinned, hook after-new-window installed\.$/m)
    assert.match(created, /attach with: tmux attach -t team/)
    assert.equal((await server("show-options", "-v", "-t", "team", "@ttt_setup")).trim(), "agents")
    // Effective values (-A): what the user's own config already satisfies is not pinned again.
    assert.equal((await server("show-options", "-A", "-v", "-t", "team", "base-index")).trim(), "1")
    assert.equal((await server("show-options", "-A", "-v", "-t", "team", "destroy-unattached")).trim(), "off")
    assert.equal((await server("show-options", "-A", "-v", "-t", "team", "history-limit")).trim(), "10000")
    const first = (await server("display-message", "-p", "-t", "team:1", "#{window_id}")).trim()
    assert.equal((await server("show-options", "-wA", "-v", "-t", first, "remain-on-exit")).trim(), "on")
    assert.equal((await server("show-options", "-wA", "-v", "-t", first, "allow-rename")).trim(), "off")
    assert.match(await server("show-options", "-wA", "-v", "-t", first, "pane-border-format"), /@ttt_agent/)
    assert.doesNotMatch(await server("show-options", "-g"), /@ttt_/, "nothing is written globally")

    const record = JSON.parse(await readFile(join(home, "sessions", "team", "session.json"), "utf8")) as { profile: string; hookBin: string }
    assert.equal(record.profile, "agents")
    assert.equal(record.hookBin, BIN)

    await assert.rejects(outside("tmux", "setup", "--name", "team"), /session already exists: team/)
    await assert.rejects(outside("tmux", "setup", "--name", "bad name"), /session name may contain only/)
    await assert.rejects(outside("tmux", "setup", "--name", "x", "--profile", "nope"), /unknown profile "nope"; available: agents/)

    // A window the human opens by hand goes through the hook.
    await server("new-window", "-t", "team", "-n", "HUMAN", "sh")
    const human = (await server("display-message", "-p", "-t", "team:HUMAN", "#{window_id}")).trim()
    const deadline = Date.now() + 5_000
    for (;;) {
      const status = (await server("show-options", "-wA", "-v", "-t", human, "pane-border-status")).trim()
      if (status === "top") break
      if (Date.now() > deadline) assert.fail(`hook never normalized ${human}: ${await server("show-messages")}`)
      await sleep(100)
    }
    assert.equal((await server("show-options", "-wA", "-v", "-t", human, "remain-on-exit")).trim(), "on")

    const shown = await outside("--session", "team", "tmux", "tree")
    assert.match(shown, /^team \$\d+$/m)
    assert.match(shown, /^ {2}\d+:HUMAN @\d+/m)
    const asJson = JSON.parse(await outside("--session", "team", "tmux", "tree", "--json")) as { windows: Array<{ name: string; panes: Array<{ historyLimit: number }> }> }
    assert.deepEqual(asJson.windows.map((window) => window.name).sort(), ["HUMAN", "tmux"].sort())
    assert.equal(asJson.windows[0]!.panes[0]!.historyLimit, 10_000)

    const report = await outside("--session", "team", "tmux", "doctor")
    assert.match(report, /^ok {3}setup: profile agents, recorded /m)
    assert.match(report, /^warn clients: no client attached/m)
    assert.doesNotMatch(report, /^FAIL/m)
    await assert.rejects(outside("--session", "team", "tmux", "doctor", "--strict"), /doctor found problems in team/)
    // Someone breaks a pinned option by hand: doctor fails and names the fix.
    await server("set-option", "-w", "-t", human, "allow-rename", "on")
    const broken = await outside("--session", "team", "tmux", "doctor").catch((error: unknown) => (error as { stdout: string }).stdout)
    assert.match(broken, new RegExp(`^FAIL window ${human} allow-rename: is on, wanted off`, "m"))
    assert.match(broken, new RegExp(`fix: tmux set-option -w -t ${human} allow-rename "off"`))
    await assert.rejects(outside("--session", "team", "tmux", "unknown"), /ttt tmux needs one of: setup, doctor, tree/)
    await assert.rejects(outside("--session", "team", "--from", "A", "tmux", "tree"), /--from does not apply/)
  } finally {
    await server("kill-server").catch(() => undefined)
    await rm(tmpDir, { recursive: true, force: true })
  }
})
