import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"

import { Board, MessageKind, MessagePriority, makeMessageId, messageDay } from "../src/index.ts"
import type { BoardMessage, NotificationSummary, SendOptions } from "../src/index.ts"

const roots: string[] = []
after(async() => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

async function freshBoard(): Promise<Board> {
  return (await freshSession()).board
}

async function freshSession(): Promise<{ board: Board; sessionRoot: string }> {
  const sessionRoot = await mkdtemp(join(tmpdir(), "ttt-board-"))
  roots.push(sessionRoot)
  return { board: new Board({ sessionRoot, notifySeconds: 0, lock: { timeoutMs: 2_000, staleMs: 60_000 } }), sessionRoot }
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
  assert.equal((await board.thread(root.message.messageId))[0]!.subject, "launch")
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
