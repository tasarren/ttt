import assert from "node:assert/strict"
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { after, test } from "node:test"

import { Board, MessageKind, MessagePriority, makeMessageId, messageDay } from "../src/index.ts"
import type { BoardMessage, NotificationSummary, SendOptions } from "../src/index.ts"
import { withDirectoryLock } from "../src/store.ts"

const roots: string[] = []
after(async() => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

async function freshBoard(): Promise<Board> {
  return (await freshSession()).board
}

async function freshSession(overrides: { notifySeconds?: number; notifyOverrides?: Record<string, number>; lock?: { timeoutMs: number; staleMs: number } } = {}): Promise<{ board: Board; sessionRoot: string }> {
  const sessionRoot = await mkdtemp(join(tmpdir(), "ttt-board-"))
  roots.push(sessionRoot)
  return {
    board: new Board({
      sessionRoot,
      notifySeconds: overrides.notifySeconds ?? 0,
      ...(overrides.notifyOverrides ? { notifyOverrides: overrides.notifyOverrides } : {}),
      lock: overrides.lock ?? { timeoutMs: 2_000, staleMs: 60_000 },
    }),
    sessionRoot,
  }
}

const NORMAL: SendOptions = { kind: MessageKind.Message, priority: MessagePriority.Normal, replyExpected: true }

test("message ids embed a recoverable day shard", () => {
  const id = makeMessageId(new Date("2026-09-02T17:33:55Z"))
  assert.match(id, /^ttt-20260902-173355-[0-9a-f]{8}$/)
  assert.equal(messageDay(id), "20260902")
  assert.equal(messageDay("ab-20260902-nope"), undefined)
})

test("send -> read -> ack round trip, with status and thread", async() => {
  const board = await freshBoard()
  const { message, notifications } = await board.send("A", ["B"], "hello", NORMAL)
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0]!.target, "B")

  assert.equal(await board.unreadCount("B"), 1)
  const peeked = (await board.read("B", { max: 10, peek: true, latest: false })).messages
  assert.equal(peeked[0]!.body, "hello")
  assert.equal(await board.unreadCount("B"), 1, "peek keeps the message unread")

  const batch = await board.read("B", { max: 10, peek: false, latest: false })
  assert.equal(batch.messages.length, 1)
  assert.equal(batch.remaining, 0)
  assert.equal(await board.unreadCount("B"), 0)

  const receipt = await board.ack("B", message.messageId, "  done ")
  assert.equal(receipt.state, "acked")
  assert.equal(receipt.ackNote, "done")

  const reply = await board.send("B", ["A"], "ok", { ...NORMAL, kind: MessageKind.Reply, inReplyTo: message.messageId })
  assert.equal(reply.message.threadId, message.messageId)
  assert.deepEqual((await board.thread(reply.message.messageId)).map((m) => m.body), ["hello", "ok"])

  const status = await board.messageStatus(message.messageId)
  assert.equal(status.receipts[0]!.state, "acked")
  assert.deepEqual(await board.inboxSummary("B"), { unread: 0, read: 0, acked: 1, superseded: 0 })
})

test("reads and acks record the detected actor, whatever the mailbox claims", async() => {
  const board = await freshBoard()
  const sent = await board.send("A", ["B"], "hello", NORMAL)
  const actor = { window: "C", session: "work" }
  const batch = await board.read("B", { max: 10, peek: false, latest: false, actor })
  assert.equal(batch.messages.length, 1)
  const status = await board.messageStatus(sent.message.messageId)
  assert.deepEqual(status.receipts[0]!.readBy, actor)
  const receipt = await board.ack("B", sent.message.messageId, "done", actor)
  assert.deepEqual(receipt.ackedBy, actor)
})

test("peeks and system transitions record no actor; old receipts stay silent", async() => {
  const board = await freshBoard()
  const sent = await board.send("A", ["B"], "hello", NORMAL)
  await board.read("B", { max: 10, peek: true, latest: false, actor: { window: "C", session: "work" } })
  const peeked = await board.messageStatus(sent.message.messageId)
  assert.equal(peeked.receipts[0]!.readBy, undefined)
  assert.equal(peeked.receipts[0]!.state, "unread")
  await board.read("B", { max: 10, peek: false, latest: false })
  const plain = await board.messageStatus(sent.message.messageId)
  assert.deepEqual(plain.receipts[0]!.readBy, undefined, "actor is optional")
})

test("dropPaneRegistry removes the v6 registry once and counts honestly on dry-run", async() => {
  const { board, sessionRoot } = await freshSession()
  assert.equal(await board.dropPaneRegistry({ dryRun: true }), false)
  await mkdir(join(sessionRoot, "state"), { recursive: true })
  await writeFile(join(sessionRoot, "state", "panes.json"), "{}")
  assert.equal(await board.dropPaneRegistry({ dryRun: true }), true)
  await assert.doesNotReject(access(join(sessionRoot, "state", "panes.json")), "dry-run leaves the file")
  assert.equal(await board.dropPaneRegistry({ dryRun: false }), true)
  await assert.rejects(access(join(sessionRoot, "state", "panes.json")))
  assert.equal(await board.dropPaneRegistry({ dryRun: false }), false, "rerun is a no-op")
})

test("threadParticipants unions senders and recipients across nested replies", async() => {
  const board = await freshBoard()
  const root = await board.send("A", ["B", "C"], "group root", { ...NORMAL, subject: "launch" })
  assert.deepEqual(await board.threadParticipants(root.message.threadId), ["A", "B", "C"])
  const nested = await board.send("B", ["A"], "b nested", { ...NORMAL, kind: MessageKind.Reply, inReplyTo: root.message.messageId })
  assert.deepEqual(await board.threadParticipants(nested.message.threadId), ["A", "B", "C"])
  const widener = await board.send("C", ["A", "B"], "c widens", { ...NORMAL, kind: MessageKind.Reply, inReplyTo: nested.message.messageId })
  assert.deepEqual(await board.threadParticipants(widener.message.threadId), ["A", "B", "C"])
})

test("--replace supersedes only unread messages from the same sender with the same key", async() => {
  const board = await freshBoard()
  await board.send("A", ["B"], "status 1", { ...NORMAL, replaceKey: "status" })
  await board.send("C", ["B"], "status from C", { ...NORMAL, replaceKey: "status" })
  await board.send("A", ["B"], "unrelated", NORMAL)
  const latest = await board.send("A", ["B"], "status 2", { ...NORMAL, replaceKey: "status" })

  // Same-millisecond sends share a timestamp; per-mailbox seq keeps send order.
  const burst = await board.read("B", { max: 10, peek: true, latest: false })
  assert.deepEqual(burst.messages.map((m) => m.body), ["status from C", "unrelated", "status 2"])
  assert.equal(burst.remaining, 3)
  const summary = await board.inboxSummary("B")
  assert.equal(summary.superseded, 1)
  const status = await board.messageStatus(latest.message.messageId)
  assert.equal(status.receipts[0]!.state, "unread")
})

test("a burst yields one marker and one notification; a stale token delivers nothing", async() => {
  const board = await freshBoard()
  const first = await board.send("A", ["B"], "one", NORMAL)
  const second = await board.send("A", ["B"], "two", NORMAL)
  const third = await board.send("C", ["B"], "three", NORMAL)
  assert.equal(first.notifications.length, 1)
  assert.equal(second.notifications.length, 0, "second send reuses the pending marker")
  assert.equal(third.notifications.length, 0)

  const delivered: NotificationSummary[] = []
  const token = first.notifications[0]!.token
  assert.equal(await board.deliverNotification("B", token, async(summary) => { delivered.push(summary) }), true)
  assert.equal(delivered.length, 1)
  assert.equal(delivered[0]!.newCount, 3)
  assert.equal(delivered[0]!.unreadTotal, 3)
  assert.deepEqual(delivered[0]!.senders, [{ name: "A", count: 2 }, { name: "C", count: 1 }])

  assert.equal(await board.deliverNotification("B", token, async() => assert.fail("must not deliver")), false)
  const status = await board.messageStatus(first.message.messageId)
  assert.ok(status.receipts[0]!.notifiedAt)

  const fourth = await board.send("A", ["B"], "four", NORMAL)
  assert.equal(fourth.notifications.length, 1, "after delivery a new burst schedules a new marker")
})

test("urgent sends create no marker and mark the receipt notified when pushed", async() => {
  const board = await freshBoard()
  const { message, notifications } = await board.send("A", ["B"], "stop", { ...NORMAL, priority: MessagePriority.Urgent })
  assert.equal(notifications.length, 0)
  const pushed: BoardMessage[] = []
  await board.deliverUrgent(message, "B", async(m) => { pushed.push(m) })
  assert.equal(pushed[0]?.body, "stop")
  assert.ok((await board.messageStatus(message.messageId)).receipts[0]!.notifiedAt)
  assert.equal(await board.unreadCount("B"), 1, "urgent delivery does not mark it read")
  assert.ok(await board.scheduleNotification("B"), "fallback scheduling creates a marker")
})

test("concurrent sends to one mailbox serialize on the lock and lose nothing", async() => {
  const board = await freshBoard()
  await Promise.all(Array.from({ length: 8 }, (_, i) => board.send("A", ["B"], `m${i}`, NORMAL)))
  assert.equal(await board.unreadCount("B"), 8)
})

test("rejects unsafe names and unknown ids", async() => {
  const board = await freshBoard()
  await assert.rejects(board.send("A", ["../x"], "hi", NORMAL), /target window name/)
  await assert.rejects(board.send("A", ["B"], "   ", NORMAL), /empty/)
  await assert.rejects(board.findMessage("ttt-20260902-000000-deadbeef"), /not found/)
  await assert.rejects(board.ack("B", "nope"), /not in B's mailbox/)
})

test("unread index tracks mutations and heals when missing", async() => {
  const { board, sessionRoot } = await freshSession()
  await board.send("A", ["B"], "one", NORMAL)
  await board.send("A", ["B"], "two", NORMAL)
  assert.equal(await board.unreadCount("B"), 2)
  await rm(join(sessionRoot, "state", "B.unread.json"), { force: true })
  assert.equal(await board.unreadCount("B"), 2, "a missing counter heals via a walk")
  await board.read("B", { max: 1, peek: false, latest: false })
  assert.equal(await board.unreadCount("B"), 1)
  const batch = await board.read("B", { max: 10, peek: true, latest: false })
  await board.ack("B", batch.messages[0]!.messageId, "done")
  assert.equal(await board.unreadCount("B"), 0)
  await board.ackAll("B")
  assert.deepEqual(await board.inboxSummary("B"), { unread: 0, read: 0, acked: 2, superseded: 0 })
})

test("replace decrements the unread index via supersede", async() => {
  const board = await freshBoard()
  await board.send("A", ["B"], "status 1", { ...NORMAL, replaceKey: "status" })
  assert.equal(await board.unreadCount("B"), 1)
  await board.send("A", ["B"], "status 2", { ...NORMAL, replaceKey: "status" })
  assert.equal(await board.unreadCount("B"), 1)
  assert.deepEqual(await board.inboxSummary("B"), { unread: 1, read: 0, acked: 0, superseded: 1 })
})

test("subjects live on the root only and reject empties and replies", async() => {
  const board = await freshBoard()
  const root = await board.send("A", ["B"], "q", { ...NORMAL, subject: "  launch  " })
  assert.equal(root.message.subject, "launch")
  await assert.rejects(board.send("A", ["B"], "q", { ...NORMAL, subject: "   " }), /--subject cannot be empty/)
  await assert.rejects(
    board.send("B", ["A"], "a", { ...NORMAL, kind: MessageKind.Reply, inReplyTo: root.message.messageId, subject: "x" }),
    /root only/,
  )
  const reply = await board.send("B", ["A"], "a", { ...NORMAL, kind: MessageKind.Reply, inReplyTo: root.message.messageId })
  assert.equal(reply.message.subject, undefined)
  const rooted = (await board.thread(root.message.messageId)).find((m) => m.messageId === root.message.messageId)!
  assert.equal(rooted.subject, "launch")
})

test("a dead notifier's stale marker is replaced instead of blocking the burst", async() => {
  const { board, sessionRoot } = await freshSession()
  await mkdir(join(sessionRoot, "state"), { recursive: true })
  await writeFile(
    join(sessionRoot, "state", "B.notification.json"),
    JSON.stringify({ token: "dead-token", target: "B", createdAt: new Date(Date.now() - 3_600_000).toISOString(), delaySeconds: 60 }),
  )
  const sent = await board.send("A", ["B"], "after crash", NORMAL)
  assert.equal(sent.notifications.length, 1)
  assert.notEqual(sent.notifications[0]!.token, "dead-token")
})

test("a busy mailbox reports its name with a retry hint, not a lock path", async() => {
  const { board, sessionRoot } = await freshSession({ lock: { timeoutMs: 50, staleMs: 60_000 } })
  const holder = withDirectoryLock(join(sessionRoot, "locks", "B.lock"), { timeoutMs: 50, staleMs: 60_000 }, () => sleep(300))
  await sleep(20)
  await assert.rejects(board.send("A", ["B"], "hi", NORMAL), /mailbox B is busy; retry shortly/)
  await holder
})

test("cancelNotification removes only the matching marker so a failed spawn can reschedule", async() => {
  const board = await freshBoard()
  const first = await board.send("A", ["B"], "one", NORMAL)
  const token = first.notifications[0]!.token
  assert.equal(await board.cancelNotification("B", "wrong-token"), false)
  assert.equal(await board.cancelNotification("B", token), true)
  const retry = await board.send("A", ["B"], "two", NORMAL)
  assert.equal(retry.notifications.length, 1)
})

test("ackAll marks every unacked receipt in one lock with one note", async() => {
  const board = await freshBoard()
  await board.send("A", ["B"], "one", NORMAL)
  await board.send("A", ["B"], "two", NORMAL)
  await board.read("B", { max: 1, peek: false, latest: false })
  const acked = await board.ackAll("B", "batch")
  assert.equal(acked.length, 2)
  assert.ok(acked.every((receipt) => receipt.state === "acked" && receipt.ackNote === "batch"))
  assert.deepEqual(await board.ackAll("B"), [])
  assert.deepEqual(await board.inboxSummary("B"), { unread: 0, read: 0, acked: 2, superseded: 0 })
})

test("thread resolves via the index and prune GCs only terminal history", async() => {
  const board = await freshBoard()
  const first = await board.send("A", ["B"], "q", NORMAL)
  const reply = await board.send("B", ["A"], "a", { ...NORMAL, kind: MessageKind.Reply, inReplyTo: first.message.messageId })
  assert.deepEqual(
    (await board.thread(first.message.messageId)).map((m) => m.messageId).sort(),
    [first.message.messageId, reply.message.messageId].sort(),
  )
  const dry = await board.prune({ olderThanMs: 0, dryRun: true })
  assert.equal(dry.messages, 0, "unread history is never pruned, even dry")
  await board.ack("B", first.message.messageId, "done")
  await board.ack("A", reply.message.messageId, "done")
  const preview = await board.prune({ olderThanMs: 0, dryRun: true })
  assert.equal(preview.messages, 2)
  const done = await board.prune({ olderThanMs: 0, dryRun: false })
  assert.equal(done.messages, 2)
  assert.equal(done.receipts, 2)
  assert.deepEqual(await board.thread(reply.message.messageId).catch(() => []), [])
  assert.deepEqual(await board.inboxSummary("B"), { unread: 0, read: 0, acked: 0, superseded: 0 })
})

test("per-window notify overrides resolve per target", async() => {
  const { board } = await freshSession()
  assert.equal(board.notifyDelay("B"), 0)
  const { board: custom } = await freshSession({ notifySeconds: 60, notifyOverrides: { B: 5 } })
  assert.equal(custom.notifyDelay("B"), 5)
  assert.equal(custom.notifyDelay("C"), 60)
  const sent = await custom.send("A", ["B"], "hi", NORMAL)
  assert.equal(sent.notifications[0]!.delaySeconds, 5)
})

test("ttl lapses unread receipts to superseded on next access; acking expired rejects", async() => {
  const board = await freshBoard()
  const sent = await board.send("A", ["B"], "ping", { ...NORMAL, ttlMs: 200 })
  assert.ok(sent.message.expiresAt)
  assert.equal(await board.unreadCount("B"), 1)
  await sleep(400)
  const batch = await board.read("B", { max: 10, peek: false, latest: false })
  assert.equal(batch.messages.length, 0, "expired messages never surface")
  assert.equal(batch.remaining, 0)
  assert.deepEqual(await board.inboxSummary("B"), { unread: 0, read: 0, acked: 0, superseded: 1 })

  const late = await board.send("A", ["B"], "ping2", { ...NORMAL, ttlMs: 200 })
  await sleep(400)
  await assert.rejects(board.ack("B", late.message.messageId), /expired/)
  assert.deepEqual(await board.inboxSummary("B"), { unread: 0, read: 0, acked: 0, superseded: 2 })
})

test("a live presence suppresses the notification marker; a dead or withdrawn one does not", async() => {
  const { board, sessionRoot } = await freshSession({ notifySeconds: 5 })
  const withdraw = await board.announcePresence("B", "any")
  assert.deepEqual((await board.presence("B"))?.expect, "any")
  const quiet = await board.send("A", ["B"], "while waiting", NORMAL)
  assert.deepEqual(quiet.waiting, ["B"])
  assert.equal(quiet.notifications.length, 0, "no marker while B is listening")
  assert.equal(await board.unreadCount("B"), 1, "the receipt is still written")

  await withdraw()
  assert.equal(await board.presence("B"), undefined)
  const loud = await board.send("A", ["B"], "after leaving", NORMAL)
  assert.deepEqual(loud.waiting, [])
  assert.equal(loud.notifications.length, 1)

  // A crashed waiter leaves a file with a dead pid: senders treat it as absent and clean it up.
  await writeFile(join(sessionRoot, "state", "B.waiting.json"), JSON.stringify({ pid: 2 ** 22 - 1, since: new Date().toISOString(), expect: "any" }))
  assert.equal(await board.presence("B"), undefined)
  await assert.rejects(access(join(sessionRoot, "state", "B.waiting.json")), "stale presence removed")

  // A thread-scoped presence is reported as such so senders can detect mutual waits.
  const rootId = quiet.message.threadId
  const withdrawThread = await board.announcePresence("B", { threadId: rootId })
  assert.deepEqual((await board.presence("B"))?.expect, { threadId: rootId })
  await withdrawThread()
})

test("read with `only` flips just those receipts and reports the rest as remaining", async() => {
  const { board } = await freshSession()
  const first = await board.send("A", ["B"], "one", NORMAL)
  await board.send("A", ["B"], "two", NORMAL)
  const shown = await board.read("B", { max: 10, peek: false, latest: false, only: new Set([first.message.messageId]) })
  assert.deepEqual(shown.messages.map((message) => message.body), ["one"])
  assert.equal(shown.remaining, 1)
  assert.equal(await board.unreadCount("B"), 1)
})

test("announcing a wait cancels a pending marker; its notifier then exits silently", async() => {
  const board = await freshBoard()
  const sent = await board.send("A", ["B"], "before the wait", NORMAL)
  const token = sent.notifications[0]!.token
  const withdraw = await board.announcePresence("B", "any")
  assert.equal(await board.deliverNotification("B", token, async() => assert.fail("must not deliver")), false)
  await withdraw()
})

test("a notifier that fires mid-wait delivers nothing and drops the marker", async() => {
  const board = await freshBoard()
  const sent = await board.send("A", ["B"], "hello", NORMAL)
  const token = sent.notifications[0]!.token
  const withdraw = await board.announcePresence("B", "any")
  const delivered: NotificationSummary[] = []
  assert.equal(await board.deliverNotification("B", token, async(summary) => { delivered.push(summary) }), false)
  assert.equal(delivered.length, 0)
  assert.equal(await board.unreadCount("B"), 1, "the waiter reads the receipt itself")
  assert.equal((await board.messageStatus(sent.message.messageId)).receipts[0]!.notifiedAt, undefined)
  await withdraw()
  // The waiter left without reading: the next burst re-arms and delivers as before.
  const rearmed = await board.scheduleNotification("B")
  assert.ok(rearmed)
  assert.equal(await board.deliverNotification("B", rearmed.token, async(summary) => { delivered.push(summary) }), true)
  assert.equal(delivered.length, 1)
})

test("a thread-scoped wait skips only its own thread's mail", async() => {
  const board = await freshBoard()
  const first = await board.send("A", ["B"], "thread one", NORMAL)
  const second = await board.send("C", ["B"], "other thread", NORMAL)
  assert.notEqual(first.message.threadId, second.message.threadId)
  const token = first.notifications[0]!.token
  const withdraw = await board.announcePresence("B", { threadId: first.message.threadId })
  assert.equal(await board.deliverNotification("B", token, async() => assert.fail("its own thread arrives via the wait")), false)
  await withdraw()
  const withdrawOther = await board.announcePresence("B", { threadId: "ttt-20000101-000000-00000000" })
  const rearmed = await board.scheduleNotification("B")
  assert.ok(rearmed)
  let pasted = 0
  assert.equal(await board.deliverNotification("B", rearmed.token, async() => { pasted += 1 }), true)
  assert.equal(pasted, 1, "mail no waiter wakes for still gets pasted")
  await withdrawOther()
})

test("urgent delivery skips a matching waiter and pastes otherwise", async() => {
  const board = await freshBoard()
  const first = await board.send("A", ["B"], "one", { ...NORMAL, priority: MessagePriority.Urgent })
  const second = await board.send("A", ["B"], "two", { ...NORMAL, priority: MessagePriority.Urgent })
  let pasted = 0
  const withdraw = await board.announcePresence("B", "any")
  await board.deliverUrgent(first.message, "B", async() => { pasted += 1 })
  assert.equal(pasted, 0, "an `any` waiter wakes on the receipt itself")
  assert.equal(await board.unreadCount("B"), 2)
  await withdraw()
  const withdrawThread = await board.announcePresence("B", { threadId: "ttt-20000101-000000-00000000" })
  await board.deliverUrgent(second.message, "B", async() => { pasted += 1 })
  assert.equal(pasted, 1, "a thread waiter never wakes for other-thread mail, so it gets pasted")
  await withdrawThread()
  await board.deliverUrgent(second.message, "B", async() => { pasted += 1 })
  assert.equal(pasted, 2, "no waiter: pasted as before")
})

test("empty read-waits lengthen the next wait to the cap, then arrival resets", async() => {
  const board = await freshBoard()
  const input = { baseSeconds: 120, maxSeconds: 300 }
  assert.deepEqual(await board.waitTimeout("B", input), { seconds: 120, emptyStreak: 0 })
  await board.noteWait("B", true)
  assert.deepEqual(await board.waitTimeout("B", input), { seconds: 180, emptyStreak: 1 })
  await board.noteWait("B", true)
  await board.noteWait("B", true)
  assert.deepEqual(await board.waitTimeout("B", input), { seconds: 300, emptyStreak: 3 })
  await board.noteWait("B", true)
  assert.deepEqual(await board.waitTimeout("B", input), { seconds: 300, emptyStreak: 4 }, "past the cap the wait stays put")
  await board.noteWait("B", false)
  assert.deepEqual(await board.waitTimeout("B", input), { seconds: 120, emptyStreak: 0 }, "arrival restarts at base")
})

test("waitTimeout honors an explicit timeout, caps custom maxima, and forgets stale streaks", async() => {
  const { board, sessionRoot } = await freshSession()
  assert.deepEqual(await board.waitTimeout("B", { baseSeconds: 120, maxSeconds: 300, explicitSeconds: 45 }), { seconds: 45, emptyStreak: 0 })
  assert.deepEqual(await board.waitTimeout("B", { baseSeconds: 2, maxSeconds: 4 }), { seconds: 2, emptyStreak: 0 })
  await board.noteWait("B", true)
  assert.deepEqual(await board.waitTimeout("B", { baseSeconds: 2, maxSeconds: 4 }), { seconds: 4, emptyStreak: 1 }, "the ramp caps at the max")
  await writeFile(join(sessionRoot, "state", "B.wait.json"), JSON.stringify({ emptyStreak: 9, updatedAt: new Date(Date.now() - 10_000).toISOString() }))
  assert.deepEqual(await board.waitTimeout("B", { baseSeconds: 2, maxSeconds: 4 }), { seconds: 2, emptyStreak: 0 }, "a streak older than the cap is a new idle period")
  await writeFile(join(sessionRoot, "state", "B.wait.json"), JSON.stringify({ emptyStreak: "many", updatedAt: "yesterday" }))
  assert.deepEqual(await board.waitTimeout("B", { baseSeconds: 2, maxSeconds: 4 }), { seconds: 2, emptyStreak: 0 }, "a corrupt file is no streak")
})
