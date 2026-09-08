/**
 * End-to-end: a private tmux server (own socket, never the developer's session), two windows A and B,
 * and the real CLI run from source with the environment tmux gives a process inside a pane.
 */
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
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
    // a deterministic "harness" for the suite: a POSIX shell whose prompt is the ready line
    "harnesses": { "shell": { "bin": "sh", "ready": "^[^ ]*[$#] *$", "default": true }, "codex": {} },
  }`)
  await tmux("new-session", "-d", "-s", SESSION, "-n", "A", "-x", "160", "-y", "40", "sh")
  await tmux("new-window", "-t", SESSION, "-n", "B", "sh")
  socketPath = (await tmux("display-message", "-p", "#{socket_path}")).trim()
  for (const window of ["A", "B"]) {
    panes[window] = (await tmux("display-message", "-p", "-t", `${SESSION}:${window}`, "#{pane_id}")).trim()
    // Registers each pane as its window's agent; the suite asserts stamps directly later.
    await ttt(window, "whoami")
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
  await ttt("C", "whoami")
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
  await paneShows("B", "name: B")
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

test("delivery targets the seat: a stamp, else the first pane; a second pane becomes WINDOW-N, never the window's name", async() => {
  // A ttt run *inside* a second pane (real PID ancestry) registers that pane as A-2: A's own stamp is untouched.
  const newPane = (await tmux("split-window", "-t", `${SESSION}:A`, "-P", "-F", "#{pane_id}", "sh")).trim()
  await tmux("send-keys", "-t", newPane, `TTT_HOME=${home} ${process.execPath} ${BIN} send B -- pane probe`, "Enter")
  await paneShows("A", "queued ttt-")
  const deadline = Date.now() + 5_000
  for (;;) {
    const stamped = (await tmux("display-message", "-p", "-t", newPane, "#{@ttt_agent}")).trim()
    if (stamped === "A-2") break
    if (Date.now() > deadline) assert.fail(`pane ${newPane} never got stamped @ttt_agent=A-2 (got ${JSON.stringify(stamped)})`)
    await sleep(100)
  }
  assert.equal((await tmux("display-message", "-p", "-t", panes["A"]!, "#{@ttt_agent}")).trim(), "A", "the original pane keeps its stamp")
  assert.match(await ttt("B", "read"), /\[1\/1\] A-2 ttt-/, "the message came from A-2")
  await ttt("B", "ack", "--all", "--", "seen")
  // A-2 is an agent of its own: messageable by name, seated in its pane; A's mail still lands in A's pane.
  panes["A-2"] = newPane
  await tmux("clear-history", "-t", panes["A"]!)
  await tmux("send-keys", "-t", panes["A"]!, "clear", "Enter")
  assert.match(await ttt("B", "send", "A-2", "--no-reply", "--", "second seat probe"), /queued ttt-\S+ -> A-2/)
  await paneShows(newPane, "ttt: 1 new from B(1);")
  assert.doesNotMatch(await tmux("capture-pane", "-p", "-t", panes["A"]!), /1 new from B\(1\)/, "A's pane did not get A-2's notification")
  const me = await ttt("A-2", "whoami")
  assert.match(me, /^name: A-2$/m)
  assert.match(me, /^window: A \(its main agent is A; you are a second agent there\)$/m)
  assert.match(await ttt("A-2", "send", "A", "--no-reply", "--", "hello main"), /queued ttt-\S+ -> A/, "a second agent may message its window's main agent")
  await assert.rejects(ttt("A-2", "send", "A-2", "--", "me"), /refusing to send a message to yourself/)
  // `ttt panes` shows both seats; `ttt windows` stays one line per window.
  const listed = await ttt("B", "panes", "--window", "A")
  assert.match(listed, /^1\t%\d+\tA\tsh\t\(seat\)$/m, listed)
  assert.match(listed, /^2\t%\d+\tA-2\tsh$/m, listed)
  assert.doesNotMatch(await ttt("B", "windows"), /A-2/)
  // broadcast --all reaches main agents only: A and C get it, A-2 does not.
  const wide = await ttt("B", "broadcast", "--all", "--no-reply", "--", "all hands")
  assert.match(wide, /-> A, C/)
  assert.doesNotMatch(wide, /A-2/)
  await ttt("A-2", "ack", "--all", "--", "done")
  await ttt("A", "ack", "--all", "--", "done")
  await ttt("C", "ack", "--all", "--", "done")
  await tmux("kill-pane", "-t", newPane)
  delete panes["A-2"]
  // With every stamp gone the window is unregistered, not unreachable: its first pane receives.
  await tmux("set-option", "-p", "-t", panes["A"]!, "-u", "@ttt_agent")
  await tmux("clear-history", "-t", panes["A"]!)
  await tmux("send-keys", "-t", panes["A"]!, "clear", "Enter")
  assert.match(await ttt("B", "windows"), /^A\t@\d+\t\(unregistered\)$/m)
  assert.match(await ttt("B", "send", "A", "--no-reply", "--", "fallback probe"), /queued ttt-\S+ -> A/)
  await paneShows(panes["A"]!, "ttt: 1 new from B(1);")
  assert.match(await ttt("B", "capture", "A", "--lines", "20"), /ttt: 1 new from B\(1\);/, "capture reads the seat too")
  assert.match(await ttt("B", "panes", "--window", "A"), /^1\t%\d+\tA\tsh\t\(seat\) \(unregistered\)$/m)
  // Driving by name or pane index both reach the seat.
  assert.match(await ttt("B", "tmux", "type", "A.1", "--", "echo by-index"), /^typed into A\.1 pane %\d+$/)
  await ttt("B", "tmux", "press", "A.1", "Enter")
  await paneShows("A", "echo by-index")
  // Running ttt from the pane registers it; a focused foreign pane must not steal the delivery.
  assert.match(await ttt("A", "whoami"), /^pane: %\d+ \(registered now as A: messages to that name land here\)$/m)
  assert.match(await ttt("A", "whoami"), /^pane: %\d+$/m, "a second run has nothing to register")
  assert.equal((await tmux("display-message", "-p", "-t", panes["A"]!, "#{@ttt_agent}")).trim(), "A", "pane-env identity stamps too")
  const focusPane = (await tmux("split-window", "-t", `${SESSION}:A`, "-P", "-F", "#{pane_id}", "sh")).trim()
  await tmux("select-pane", "-t", focusPane)
  await tmux("clear-history", "-t", panes["A"]!)
  await tmux("send-keys", "-t", panes["A"]!, "clear", "Enter")
  const focusProbe = await ttt("B", "send", "A", "--no-reply", "--", "focus probe")
  assert.match(focusProbe, /queued ttt-\S+ -> A/)
  await paneShows(panes["A"]!, "ttt: 1 new from B(1); 2 unread")
  const focused = await tmux("capture-pane", "-p", "-t", focusPane)
  assert.doesNotMatch(focused, /ttt: 1 new from B\(1\); 2 unread/)
  // Capture follows the same pane truth: the seat, never the focused one.
  assert.match(await ttt("B", "capture", "A", "--lines", "20"), /ttt: 1 new from B\(1\); 2 unread/)
  // Bare NAME with several panes and no stamp still means the first pane.
  await tmux("set-option", "-p", "-t", panes["A"]!, "-u", "@ttt_agent")
  assert.match(await ttt("B", "tmux", "type", "A", "--", "echo by-seat"), /^typed into A pane %\d+$/)
  await ttt("B", "tmux", "press", "A", "Enter")
  await paneShows(panes["A"]!, "echo by-seat")
  // A later pane speaking first cannot take the window's name away from its first pane.
  panes["focus"] = focusPane
  const late = await ttt("focus", "whoami")
  assert.match(late, /^name: A-3$/m, `only the first pane may register as the window, and A-2's mailbox on disk is never inherited:\n${late}`)
  assert.equal((await tmux("display-message", "-p", "-t", panes["A"]!, "#{@ttt_agent}")).trim(), "", "the first pane is still unregistered")
  delete panes["focus"]
  await tmux("kill-pane", "-t", focusPane)
  await ttt("A", "whoami")
  assert.match(await ttt("A", "ack", "--all", "--", "pane done"), /^acked ttt-/m)
  await ttt("B", "ack", "--all", "--", "pane done")
  assert.equal(existsSync(join(home, "boards", SESSION, "state", "panes.json")), false, "no registry file is written anymore")
})

test("refuses to message itself and unknown windows; capture peeks at the other pane", async() => {
  await assert.rejects(ttt("A", "send", "A", "--", "me"), /refusing to send a message to yourself/)
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
  assert.match(me, /^name: A$/m)
  assert.doesNotMatch(me, /^window:/m, "a main agent has no separate window line")
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
  const original = await readFile(settings, "utf8")
  await writeFile(settings, "{\"notifySeconds\": 1, \"notifyOverrides\": {\"B\": 7}}")
  const queued = await ttt("A", "send", "B", "--", "override probe")
  assert.match(queued, /\(notify in ~7s\)/)
  await writeFile(settings, original)
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
    assert.equal((await server("display-message", "-p", "-t", human, "#{window_name}")).trim(), "HUMAN", "a window named by its creator keeps the name")
    // A window tmux named itself (prefix c) becomes W-N: a scratch window, visibly nobody's chosen name.
    const unnamed = (await server("new-window", "-t", "team", "-P", "-F", "#{window_id}", "sh")).trim()
    const renameDeadline = Date.now() + 5_000
    for (;;) {
      const name = (await server("display-message", "-p", "-t", unnamed, "#{window_name}")).trim()
      if (name === "W-1") break
      if (Date.now() > renameDeadline) assert.fail(`hook never renamed ${unnamed} (still ${name}): ${await server("show-messages")}`)
      await sleep(100)
    }
    assert.equal((await server("display-message", "-p", "-t", unnamed, "#{@ttt_agent}")).trim(), "", "a scratch window is not stamped")
    assert.match(await server("display-message", "-p", "-t", unnamed, "#{T:window-status-format}"), /^\d+:W-1·/, "the tab marks a window without an agent")
    assert.match(await outside("--session", "team", "tmux", "rename", "W-1", "SCRATCH"), /^renamed W-1 to SCRATCH @\d+$/)
    await assert.rejects(outside("--session", "team", "tmux", "rename", "SCRATCH", "THIRTEEN-CHAR"), /longer than 12 characters/)
    // Adopting: open --window on an unregistered window restarts its pane with the harness and stamps it.
    assert.match(await outside("--session", "team", "tmux", "open", "--window", "SCRATCH", "--harness", "shell"), /^adopted SCRATCH @\d+ pane %\d+ \(shell, ready after \d+\.\ds\)$/)
    assert.equal((await server("display-message", "-p", "-t", unnamed, "#{@ttt_agent} #{@ttt_harness}")).trim(), "SCRATCH shell")
    assert.match(await server("display-message", "-p", "-t", unnamed, "#{T:window-status-format}"), /^\d+:SCRATCH[^·]/, "the mark goes once a pane is stamped")
    // A stamped window renames fine while it has no mailbox; the stamp follows. A mailbox pins the name.
    assert.match(await outside("--session", "team", "tmux", "rename", "SCRATCH", "SCRATCH2"), /^renamed SCRATCH to SCRATCH2 @\d+ \(agent pane %\d+ follows\)$/)
    assert.equal((await server("display-message", "-p", "-t", unnamed, "#{@ttt_agent}")).trim(), "SCRATCH2")
    await outside("--session", "team", "tmux", "rename", "SCRATCH2", "SCRATCH")
    await mkdir(join(home, "boards", "team", "mailboxes", "SCRATCH"), { recursive: true })
    await mkdir(join(home, "boards", "team", "mailboxes", "STALE"), { recursive: true })
    await assert.rejects(outside("--session", "team", "tmux", "rename", "SCRATCH", "OTHER"), /SCRATCH has a mailbox; renaming would orphan it\. Close SCRATCH and open OTHER instead/)
    await assert.rejects(outside("--session", "team", "tmux", "rename", "HUMAN", "STALE"), /STALE has an old mailbox that HUMAN would inherit/)
    await assert.rejects(outside("--session", "team", "tmux", "open", "--window", "SCRATCH", "--harness", "shell"), /window already exists: team:SCRATCH \(its agent is seated in %\d+/)
    await outside("--session", "team", "tmux", "close", "SCRATCH")

    const shown = await outside("--session", "team", "tmux", "tree")
    assert.match(shown, /^team \$\d+$/m)
    assert.match(shown, /^ {2}\d+:HUMAN @\d+/m)
    const asJson = JSON.parse(await outside("--session", "team", "tmux", "tree", "--json")) as { windows: Array<{ name: string; panes: Array<{ historyLimit: number }> }> }
    assert.deepEqual(asJson.windows.map((window) => window.name).sort(), ["HUMAN", "tmux"].sort())
    assert.equal(asJson.windows[0]!.panes[0]!.historyLimit, 10_000)

    const report = await outside("--session", "team", "tmux", "doctor")
    assert.match(report, /^ok {3}setup: profile agents, recorded /m)
    assert.match(report, /^(ok {3}|warn) skill /m, "doctor reports skill installs, read-only")
    assert.match(report, /^warn clients: no client attached/m)
    assert.match(report, /^ok {3}window HUMAN: unregistered: pane 1 receives until something there runs ttt$/m)
    assert.match(report, /^ok {3}harnesses: shell, codex; declared in .*settings\.jsonc; default shell$/m)
    assert.match(report, /^ok {3}harness shell: \/.*\/sh$/m, "the declared bin is resolved on PATH")
    assert.doesNotMatch(report, /^FAIL/m)
    await assert.rejects(outside("--session", "team", "tmux", "doctor", "--strict"), /doctor found problems in team/)
    // Someone breaks a pinned option by hand: doctor fails and names the fix.
    await server("set-option", "-w", "-t", human, "allow-rename", "on")
    const broken = await outside("--session", "team", "tmux", "doctor").catch((error: unknown) => (error as { stdout: string }).stdout)
    assert.match(broken, new RegExp(`^FAIL window ${human} allow-rename: is on, wanted off`, "m"))
    assert.match(broken, new RegExp(`fix: tmux set-option -w -t ${human} allow-rename "off"`))
    await assert.rejects(outside("--session", "team", "tmux", "unknown"), /ttt tmux needs one of: setup, save, restore, layouts, doctor, tree/)
    await assert.rejects(outside("--session", "team", "--from", "A", "tmux", "tree"), /--from does not apply/)

    // Layouts: build from a file, save the live shape back, restore it under another name.
    await mkdir(join(home, "layouts"), { recursive: true })
    await writeFile(join(home, "layouts", "duo.jsonc"), `{
      // two agents; CODER has a helper pane on the right
      "version": 1,
      "cwd": "${tmpDir}",
      "windows": [
        { "name": "CODER", "layout": "b046,160x40,0,0{111x40,0,0,1,48x40,112,0,5}",
          "panes": [ { "command": "sh", "agent": true, "harness": "shell" }, { "command": "sleep 300", "cwd": "/", "title": "tests" } ] },
        { "name": "LEAD" },
        { "name": "W-1", "panes": [ { "command": null }, { "command": "sh", "agent": "SIDE", "harness": "shell" } ], "layout": "b046,160x40,0,0{111x40,0,0,1,48x40,112,0,5}" },
      ],
    }`)
    assert.equal(await outside("tmux", "layouts"), "duo")
    const built = await outside("tmux", "setup", "--name", "duo", "--layout", "duo")
    assert.match(built, /^layout duo: 3 windows created\.$/m)
    const duo = JSON.parse(await outside("--session", "duo", "tmux", "tree", "--json")) as {
      windows: Array<{ name: string; panes: Array<{ pane: string; agent: string | undefined; harness: string | undefined; startCommand: string | undefined; cwd: string }> }>
    }
    assert.deepEqual(duo.windows.map((window) => window.name), ["CODER", "LEAD", "W-1"], "placeholder window is gone, order preserved")
    assert.equal(duo.windows[2]!.panes[0]!.agent, undefined, "a panes list with no agent: true leaves the window unregistered")
    assert.equal(duo.windows[2]!.panes[1]!.agent, "SIDE", "a named agent is stamped on its pane")
    assert.equal((await server("display-message", "-p", "-t", duo.windows[0]!.panes[1]!.pane, "#{@ttt_title}")).trim(), "tests", "helper titles are built")
    const [coderAgent, helper] = duo.windows[0]!.panes
    assert.equal(coderAgent!.agent, "CODER")
    assert.equal(coderAgent!.harness, "shell")
    assert.equal(coderAgent!.startCommand, "sh")
    assert.equal(helper!.agent, undefined, "the helper pane is not the agent pane")
    assert.equal(helper!.startCommand, "sleep 300")
    assert.equal(helper!.cwd, "/")
    assert.equal(duo.windows[1]!.panes[0]!.agent, "LEAD", "a window without a panes list is one agent pane")
    const geometry = (await server("display-message", "-p", "-t", "duo:CODER", "#{window_layout}")).trim()
    assert.match(geometry, /^[0-9a-f]{4},160x40,0,0\{111x40,0,0,\d+,48x40,112,0,\d+\}$/, "saved geometry replayed exactly")
    const coderWindow = (await server("display-message", "-p", "-t", "duo:CODER", "#{window_id}")).trim()
    assert.equal((await server("show-options", "-wA", "-v", "-t", coderWindow, "allow-rename")).trim(), "off", "layout windows are normalized too")

    const saved = await outside("--session", "duo", "tmux", "save", "duo-copy")
    assert.match(saved, /^saved 3 windows to .*\/layouts\/duo-copy\.jsonc$/m)
    const copy = JSON.parse(await readFile(join(home, "layouts", "duo-copy.jsonc"), "utf8")) as { windows: Array<{ name: string; harness?: string; layout?: string; panes: Array<{ command: string | null; agent?: boolean | string; title?: string; harness?: string; cwd?: string; source?: string }> }> }
    assert.equal(copy.windows[0]!.panes[0]!.harness, "shell", "harness is saved on the pane that runs it")
    assert.equal(copy.windows[0]!.panes[1]!.harness, undefined)
    assert.equal(copy.windows[0]!.layout, geometry)
    assert.deepEqual(copy.windows[0]!.panes.map((pane) => [pane.command, pane.agent ?? false, pane.title]), [["sh", true, undefined], ["sleep 300", false, "tests"]], "save keeps the title")
    assert.equal(copy.windows[2]!.panes[0]!.agent, undefined, "save keeps an unregistered pane unstamped")
    assert.equal(copy.windows[2]!.panes[1]!.agent, "SIDE", "save writes a second agent's name")
    assert.equal(copy.windows[1]!.layout, undefined, "single panes save no geometry")
    assert.equal(copy.windows[1]!.panes[0]!.command, null, "an idle shell saves as null")
    await assert.rejects(outside("--session", "duo", "tmux", "save", "duo-copy"), /already exists; pass --force/)

    assert.match(await outside("tmux", "restore", "duo-copy", "--as", "duo2"), /^layout duo-copy: 3 windows created\.$/m)
    assert.deepEqual((JSON.parse(await outside("--session", "duo2", "tmux", "tree", "--json")) as { windows: Array<{ name: string }> }).windows.map((window) => window.name), ["CODER", "LEAD", "W-1"])
    assert.deepEqual(JSON.parse(await outside("tmux", "layouts", "--json")), ["duo", "duo-copy"])

    // Lifecycle and typing verbs, all against the agent pane, never the active one.
    // `open --window` with a declared harness waits for its ready line; a bare `--harness` is the default one.
    assert.match(await outside("--session", "team", "tmux", "open", "--window", "CODER", "--harness", "shell"), /^opened CODER @\d+ pane %\d+ \(shell, ready after \d+\.\ds\)$/)
    await assert.rejects(outside("--session", "team", "tmux", "open", "--window", "CODER", "--", "sh"), /window already exists: team:CODER/)
    await assert.rejects(outside("--session", "team", "tmux", "open", "--window", "THIRTEEN-CHAR"), /longer than 12 characters/)
    await assert.rejects(outside("--session", "team", "tmux", "open", "--window", "X", "--harness", "nope"), /unknown harness "nope"; declared in .*settings\.jsonc: shell, codex/)
    await assert.rejects(outside("--session", "team", "tmux", "open", "--window", "X", "--ready", "x"), /--ready needs something to wait for: pass --harness or -- COMMAND/)
    await assert.rejects(outside("--session", "team", "tmux", "open"), /open needs exactly one of --window or --pane/)
    await assert.rejects(outside("--session", "team", "tmux", "open", "--window", "X", "--pane", "t"), /exactly one of/)
    assert.match(await outside("--session", "team", "tmux", "open", "--window", "auto", "--harness"), /^opened SHELL-1 @\d+ pane %\d+ \(shell, ready after/, "bare --harness is the default harness")
    await mkdir(join(home, "boards", "team", "mailboxes", "SHELL-2"), { recursive: true })
    assert.match(await outside("--session", "team", "tmux", "open", "--window", "auto", "--harness", "shell"), /^opened SHELL-3 @\d+/, "a name with an old mailbox is skipped")
    const shellWindow = await outside("--session", "team", "tmux", "open", "--window", "auto")
    assert.match(shellWindow, /^opened W-\d+ @\d+ pane %\d+$/, "a shell window is scratch: W-N, no wait")
    assert.equal((await server("display-message", "-p", "-t", /pane (%\d+)/.exec(shellWindow)![1]!, "#{@ttt_agent}")).trim(), "", "a bare shell is not stamped: nobody has run ttt there yet")
    // A pane with a harness is a second agent in the window: named, stamped, waited for; never the window's name.
    const namedAgent = await outside("--session", "team", "tmux", "open", "--pane", "AUX", "--in", "CODER", "--harness")
    const namedAgentPane = /^opened pane (%\d+) in CODER \(agent AUX, shell, ready after \d+\.\ds\)$/.exec(namedAgent)?.[1]
    assert.ok(namedAgentPane, namedAgent)
    assert.equal((await server("display-message", "-p", "-t", namedAgentPane, "#{@ttt_agent}|#{@ttt_harness}|#{@ttt_title}")).trim(), "AUX|shell|")
    await assert.rejects(outside("--session", "team", "tmux", "open", "--window", "AUX"), /agent AUX already exists in team: pane %\d+ of CODER/)
    await assert.rejects(outside("--session", "team", "tmux", "open", "--pane", "AUX", "--in", "CODER", "--harness"), /agent AUX already exists in team: pane %\d+ of CODER/)
    await assert.rejects(outside("--session", "team", "tmux", "open", "--pane", "HUMAN", "--in", "CODER", "--harness"), /agent HUMAN already exists in team: window HUMAN/)
    await assert.rejects(outside("--session", "team", "tmux", "rename", "HUMAN", "AUX"), /agent AUX already exists in team: pane %\d+ of CODER/)
    const autoAgent = await outside("--session", "team", "tmux", "open", "--pane", "--in", "CODER", "--harness")
    const autoAgentPane = /^opened pane (%\d+) in CODER \(agent CODER-2, shell, ready after \d+\.\ds\)$/.exec(autoAgent)?.[1]
    assert.ok(autoAgentPane, autoAgent)
    assert.match(await outside("--session", "team", "tmux", "respawn", "AUX"), /^respawned AUX pane %\d+ with: sh$/, "respawn reaches a second agent by name")
    await server("kill-pane", "-t", namedAgentPane)
    await server("kill-pane", "-t", autoAgentPane)
    const slow = await outside("--session", "team", "tmux", "open", "--window", "SLOW", "--ready", "never", "--ready-timeout", "1", "--", "sh").catch((error: unknown) => (error as { stderr: string }).stderr)
    assert.match(slow, /SLOW did not become ready \(\/never\/\) within 1s; the window @\d+ stays open/)
    assert.match(await server("list-windows", "-t", "team", "-F", "#{window_name}"), /^SLOW$/m, "timeout keeps the window")
    const coderPane = (await server("display-message", "-p", "-t", "team:CODER", "#{pane_id}")).trim()
    assert.equal((await server("display-message", "-p", "-t", coderPane, "#{@ttt_agent} #{@ttt_harness} #{@ttt_command}")).trim(), "CODER shell sh")
    const paneOut = await outside("--session", "team", "tmux", "open", "--pane", "tests", "--in", "CODER", "--horizontal", "--size", "30", "--", "sleep 300")
    const helperPane = /^opened pane (%\d+) in CODER \(tests\)$/.exec(paneOut)?.[1]
    assert.ok(helperPane, paneOut)
    assert.equal((await server("display-message", "-p", "-t", helperPane, "#{@ttt_agent}|#{@ttt_command}|#{@ttt_title}")).trim(), "|sleep 300|tests", "helper pane: command and title, no agent stamp")
    await assert.rejects(outside("--session", "team", "tmux", "open", "--pane", "t"), /--pane needs --in WINDOW when not run from inside an agent window/)
    assert.match(await outside("--session", "team", "tmux", "split", "CODER", "--", "sleep 5").catch((error: unknown) => (error as { stdout: string }).stdout), /^opened pane %\d+ in CODER$/m, "split stays as an alias")
    await server("select-pane", "-t", helperPane)
    await outside("--session", "team", "tmux", "type", "CODER", "--", "echo typed-ok")
    assert.doesNotMatch(await server("capture-pane", "-p", "-t", coderPane), /^typed-ok$/m, "type presses no Enter")
    await outside("--session", "team", "tmux", "press", "CODER", "Enter")
    assert.equal(await outside("--session", "team", "tmux", "wait", "CODER", "--for", "^typed-ok$", "--timeout", "5"), "typed-ok")
    assert.doesNotMatch(await server("capture-pane", "-p", "-t", helperPane), /typed-ok/, "the focused helper pane got nothing")
    await outside("--session", "team", "tmux", "type", "CODER", "--", "sleep 100")
    await outside("--session", "team", "tmux", "press", "CODER", "Enter")
    await sleep(300)
    assert.equal((await server("display-message", "-p", "-t", coderPane, "#{pane_current_command}")).trim(), "sleep")
    await outside("--session", "team", "tmux", "interrupt", "CODER")
    await sleep(300)
    assert.equal((await server("display-message", "-p", "-t", coderPane, "#{pane_current_command}")).trim(), "sh")
    await assert.rejects(outside("--session", "team", "tmux", "wait", "CODER", "--for", "never-printed", "--timeout", "1"), /CODER did not show \/never-printed\/ within 1s/)
    await assert.rejects(outside("--session", "team", "tmux", "wait", "CODER", "--for", "(", "--timeout", "1"), /not a valid regular expression/)
    await server("send-keys", "-t", coderPane, "exit", "Enter")
    await sleep(400)
    await assert.rejects(outside("--session", "team", "tmux", "type", "CODER", "--", "x"), /pane %\d+ of CODER is dead; run: ttt tmux respawn CODER/)
    assert.match(await outside("--session", "team", "tmux", "respawn", "CODER"), /^respawned CODER pane %\d+ with: sh$/)
    assert.equal((await server("display-message", "-p", "-t", coderPane, "#{pane_dead} #{@ttt_agent} #{@ttt_harness}")).trim(), "0 CODER shell")
    await server("set-option", "-w", "-t", "team:CODER", "synchronize-panes", "on")
    await assert.rejects(outside("--session", "team", "tmux", "press", "CODER", "Enter"), /synchronize-panes on/)
    await server("set-option", "-w", "-t", "team:CODER", "synchronize-panes", "off")
    await assert.rejects(outside("--session", "team", "tmux", "popup", "--", "true"), /no client attached to session team/)
    await outside("--session", "team", "tmux", "flash", "--", "hello humans")
    assert.match(await outside("--session", "team", "tmux", "close", "CODER"), /^closed CODER @\d+$/)
    assert.equal(await outside("--session", "team", "tmux", "windows-are-gone").catch(() => "n/a"), "n/a")
    assert.doesNotMatch(await outside("--session", "team", "tmux", "tree"), /CODER/)
    await assert.rejects(outside("tmux", "setup"), /setup needs --name SESSION \(or a terminal, for the wizard\)/)

    // A bad layout never leaves a half-built session behind.
    await writeFile(join(home, "layouts", "bad.jsonc"), "{\"version\": 1, \"windows\": [{\"name\": \"A\", \"panes\": [{}, {}]}]}")
    await assert.rejects(outside("tmux", "restore", "bad"), /has 2 panes but no layout string/)
    await assert.rejects(server("has-session", "-t", "bad"))
  } finally {
    await server("kill-server").catch(() => undefined)
    await rm(tmpDir, { recursive: true, force: true })
  }
})
