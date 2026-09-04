import assert from "node:assert/strict"
import { test } from "node:test"

import { formatBatch, formatHeaders, formatStatus, formatThread, formatThreadHeaders, previewBody, shortStamp, topicOf } from "../src/commands/inbox.ts"
import { BOARD_VERSION, MessageKind } from "@ttt/board"
import type { BoardMessage, MessageReceipt } from "@ttt/board"

function message(overrides: Partial<BoardMessage> = {}): BoardMessage {
  return {
    boardVersion: BOARD_VERSION,
    messageId: "ttt-20260902-120000-aaaaaaaa",
    threadId: "ttt-20260902-120000-aaaaaaaa",
    kind: MessageKind.Message,
    timestamp: "2026-09-02T12:00:00.000Z",
    from: "A",
    recipients: ["B"],
    replyExpected: true,
    priority: "normal",
    body: "first line\nsecond line\n",
    ...overrides,
  }
}

test("previewBody uses the first non-empty line and truncates", () => {
  assert.equal(previewBody("\n  hello  \nsecond"), "hello")
  assert.equal(previewBody("x".repeat(200)).length, 121)
  assert.equal(previewBody(""), "")
})

test("shortStamp compacts ISO timestamps and passes through garbage", () => {
  assert.equal(shortStamp("2026-09-02T12:34:56.789Z"), "09-02 12:34:56")
  assert.equal(shortStamp("nope"), "nope")
})

test("formatHeaders triages without bodies", () => {
  const text = formatHeaders([message(), message({ messageId: "ttt-20260902-120001-bbbbbbbb", from: "C", replyExpected: false })], 2)
  assert.match(text, /\(headers; still unread\)/)
  assert.match(text, /A ttt-20260902-120000-aaaaaaaa/)
  assert.match(text, /\(no-reply\)/)
  assert.match(text, /first line/)
  assert.doesNotMatch(text, /second line/)
  assert.equal(formatHeaders([], 0), "ttt: no unread messages.")
})

test("threads resolve topic and members in full and triage views", () => {
  const root = message({ subject: "launch" })
  const headers = formatHeaders([root], 1)
  assert.match(headers, /\(subj: launch; needs reply\)/)
  assert.match(formatThread([root], ["A", "B"]), /\(1 message\) topic: launch members: A, B/)
  const triage = formatThreadHeaders([root], ["A", "B"])
  assert.match(triage, /topic: launch members: A, B \(headers\)/)
  assert.match(triage, /first line/)
  assert.doesNotMatch(triage, /second line/)
  assert.equal(formatThreadHeaders([], []), "ttt: empty thread.")
  assert.equal(formatThread([], []), "ttt: empty thread.")
})

test("topic falls back to the root first line without a subject", () => {
  const text = formatThread([message()], ["A", "B"])
  assert.match(text, /topic: first line members: A, B/)
  assert.equal(topicOf(message({ body: "   \n  spaced  \n" })), "spaced")
})

test("reply obligation is explicit in every message view", () => {
  const owed = message()
  const quiet = message({ messageId: "ttt-20260902-120001-bbbbbbbb", replyExpected: false })
  assert.match(formatBatch([owed], 0, false), /reply: ttt reply ttt-20260902-120000-aaaaaaaa -- MESSAGE/)
  assert.match(formatBatch([quiet], 0, false), /reply: none needed/)
  assert.match(formatHeaders([owed], 1), /\(needs reply\)/)
  assert.match(formatHeaders([quiet], 1), /\(no-reply\)/)
  assert.match(formatThread([owed, quiet], ["A", "B"]), /reply: ttt reply ttt-20260902-120000-aaaaaaaa -- MESSAGE/)
  assert.match(formatThread([owed, quiet], ["A", "B"]), /reply: none needed/)
  assert.match(formatThreadHeaders([owed], ["A", "B"]), /reply: ttt reply/)
  assert.match(formatThreadHeaders([quiet], ["A", "B"]), /reply: none needed/)
  assert.match(formatStatus(owed, []), /, reply expected$/m)
  assert.match(formatStatus(quiet, []), /, no reply needed$/m)
})

test("status names the foreign reader, stays quiet for own reads", () => {
  const root = message({ recipients: ["B"] })
  const foreign = { ...root, messageId: "ttt-20260902-120001-bbbbbbbb" }
  const ownRead: MessageReceipt = {
    receiptVersion: 1, messageId: foreign.messageId, recipient: "B",
    enqueuedAt: "2026-09-02T12:00:00.000Z", state: "read",
    readAt: "2026-09-02T12:01:00.000Z", readBy: { window: "B", session: "work" },
  }
  assert.doesNotMatch(formatStatus(foreign, [ownRead]), /by B/)
  const proxyRead = { ...ownRead, readBy: { window: "C", session: "work" } }
  assert.match(formatStatus(foreign, [proxyRead]), /\bby C\b/)
  assert.match(formatStatus(foreign, []), /B: missing receipt/)
})

test("partial reads name what is shown and what is left", () => {
  assert.match(formatBatch([message()], 3, false), /1 message shown, 3 unread messages still unread\./)
  assert.match(formatHeaders([message()], 5), /1 message shown of 5 unread messages \(still unread\)\./)
  assert.match(formatBatch([message()], 0, false), /0 unread messages remain\./)
  assert.match(formatHeaders([message()], 1), /1 unread message remains\./)
})
