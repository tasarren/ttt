import assert from "node:assert/strict"
import { test } from "node:test"

import { formatBatch, formatHeaders, formatThread, formatThreadHeaders, previewBody, shortStamp } from "../src/commands/inbox.ts"
import { BOARD_VERSION, MessageKind } from "@ttt/board"
import type { BoardMessage } from "@ttt/board"

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

test("subjects surface in headers and thread views", () => {
  const root = message({ subject: "launch" })
  const headers = formatHeaders([root], 1)
  assert.match(headers, /\(subj: launch\)/)
  assert.match(formatThread([root]), /\(1 message\) subj: launch/)
  const triage = formatThreadHeaders([root])
  assert.match(triage, /\(headers\)/)
  assert.match(triage, /first line/)
  assert.doesNotMatch(triage, /second line/)
  assert.equal(formatThreadHeaders([]), "ttt: empty thread.")
})

test("partial reads name what is shown and what is left", () => {
  assert.match(formatBatch([message()], 3, false), /1 message shown, 3 unread messages still unread\./)
  assert.match(formatHeaders([message()], 5), /1 message shown of 5 unread messages \(still unread\)\./)
  assert.match(formatBatch([message()], 0, false), /0 unread messages remain\./)
  assert.match(formatHeaders([message()], 1), /1 unread message remains\./)
})
