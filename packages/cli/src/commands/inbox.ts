import { assertName } from "@ttt/board"
import type { BoardMessage, MessageReceipt } from "@ttt/board"

import { boundedInt, parseCommandArgs, splitAtTerminator } from "../args.ts"
import { usageError } from "../cli-error.ts"
import type { Handler } from "../context.ts"

const READ_OPTIONS = {
  max: { type: "string" },
  peek: { type: "boolean", default: false },
  latest: { type: "boolean", default: false },
  "headers-only": { type: "boolean", default: false },
} as const

export const read: Handler = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, READ_OPTIONS)
  if (positionals.length > 0) throw usageError("read takes no positional arguments")
  const max = boundedInt(values.max, "--max", ctx.settings.readMax, 1_000)
  const headersOnly = values["headers-only"]
  const { messages, remaining } = await ctx.board.read(ctx.senderName, { max, peek: values.peek || headersOnly, latest: values.latest, ...(ctx.actor ? { actor: ctx.actor } : {}) })
  process.stdout.write(`${headersOnly ? formatHeaders(messages, remaining) : formatBatch(messages, remaining, values.peek)}\n`)
}

const INBOX_OPTIONS = {
  count: { type: "boolean", default: false },
  detail: { type: "boolean", default: false },
  max: { type: "string" },
  from: { type: "string" },
} as const

/** Sender names double as directory names; rejects typos with an exit-2 usage error. */
function checkSender(name: string): void {
  try {
    assertName(name, "sender name")
  } catch(error) {
    throw usageError(error instanceof Error ? error.message : String(error))
  }
}

export const inbox: Handler = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, INBOX_OPTIONS)
  if (positionals.length > 0) throw usageError("inbox takes no positional arguments")
  if (values.count && values.detail) throw usageError("--count cannot be combined with --detail")
  if (values.from !== undefined && !values.detail) throw usageError("--from needs --detail")
  if (values.from !== undefined) checkSender(values.from)
  if (values.count) {
    const summary = await ctx.board.inboxSummary(ctx.senderName)
    process.stdout.write(`${summary.unread}\n`)
    return
  }
  if (values.detail) {
    const max = boundedInt(values.max, "--max", ctx.settings.readMax, 1_000)
    const { messages, remaining } = await ctx.board.read(ctx.senderName, { max, peek: true, latest: false, ...(ctx.actor ? { actor: ctx.actor } : {}) })
    const filtered = values.from === undefined
      ? messages
      : messages.filter((message) => message.from === values.from)
    process.stdout.write(`${formatHeaders(filtered, remaining)}\n`)
    return
  }
  if (values.max !== undefined) throw usageError("--max needs --detail")
  const summary = await ctx.board.inboxSummary(ctx.senderName)
  process.stdout.write(`ttt inbox for ${ctx.senderName}: unread ${summary.unread}, read ${summary.read}, acked ${summary.acked}, superseded ${summary.superseded}\n`)
}

const ACK_OPTIONS = {
  all: { type: "boolean", default: false },
} as const

export const ack: Handler = async(argv, ctx) => {
  const { head, body } = splitAtTerminator(argv)
  const { values, positionals } = parseCommandArgs(head, ACK_OPTIONS)
  const dashNote = body?.join(" ")
  if (values.all) {
    if (positionals.length > 0) throw usageError("usage: ttt ack --all [-- NOTE]")
    const receipts = await ctx.board.ackAll(ctx.senderName, dashNote, ctx.actor)
    for (const receipt of receipts) process.stdout.write(`acked ${receipt.messageId}\n`)
    if (receipts.length === 0) process.stdout.write("ttt: nothing to ack.\n")
    return
  }
  const [messageId, ...bareNote] = positionals
  if (messageId === undefined) throw usageError("usage: ttt ack MESSAGE_ID [-- NOTE]")
  const note = [...bareNote, ...(body ?? [])].join(" ") || undefined
  const prior = await ctx.board.messageStatus(messageId).catch(() => undefined)
  const receipt = await ctx.board.ack(ctx.senderName, messageId, note, ctx.actor)
  const wasUnread = prior?.receipts.find((item) => item.recipient === ctx.senderName)?.state === "unread"
  if (wasUnread) process.stderr.write("ttt: acked without read; the body was never marked read.\n")
  process.stdout.write(`acked ${receipt.messageId}\n`)
}

export const status: Handler = async(argv, ctx) => {
  const { positionals } = parseCommandArgs(argv, {} as const)
  const [messageId, ...extra] = positionals
  if (messageId === undefined || extra.length > 0) throw usageError("usage: ttt status MESSAGE_ID")
  const result = await ctx.board.messageStatus(messageId)
  process.stdout.write(`${formatStatus(result.message, result.receipts)}\n`)
}

const THREAD_OPTIONS = {
  "headers-only": { type: "boolean", default: false },
} as const

export const thread: Handler = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, THREAD_OPTIONS)
  const [messageId, ...extra] = positionals
  if (messageId === undefined || extra.length > 0) throw usageError("usage: ttt thread MESSAGE_ID [--headers-only]")
  const messages = await ctx.board.thread(messageId)
  const first = messages[0]
  const members = first ? await ctx.board.threadParticipants(first.threadId) : []
  process.stdout.write(`${values["headers-only"] ? formatThreadHeaders(messages, members) : formatThread(messages, members)}\n`)
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

/** First non-empty line of a body, truncated for triage output. */
export function previewBody(body: string, maxChars = 120): string {
  const first = body.split("\n").map((line) => line.trim()).find((line) => line !== "") ?? ""
  return first.length > maxChars ? `${first.slice(0, maxChars)}…` : first
}

/** Compact stamp (`MM-DD HH:MM:SS`) for token-light output; falls back to raw input. */
export function shortStamp(iso: string): string {
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return iso
  const date = new Date(time)
  const pad = (n: number): string => `${n}`.padStart(2, "0")
  return `${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
}

/** Shared tag list for triage output; headers also name the reply expectation. */
function messageTags(message: BoardMessage, includeReplyExpected: boolean): string[] {
  return [
    ...(message.subject ? [`subj: ${message.subject}`] : []),
    ...(includeReplyExpected ? [message.replyExpected ? "needs reply" : "no-reply"] : []),
    ...(message.inReplyTo ? [`re: ${message.inReplyTo}`] : []),
    ...(message.replaceKey ? [`replace: ${message.replaceKey}`] : []),
  ]
}

/** Headers + one-line previews, without bodies and without marking anything read. */
export function formatHeaders(messages: BoardMessage[], remaining: number): string {
  if (messages.length === 0) return "ttt: no unread messages."
  const lines = [`ttt: ${plural(messages.length, "message")} (headers; still unread)`]
  messages.forEach((message, index) => {
    const tags = messageTags(message, true)
    lines.push(
      `[${index + 1}/${messages.length}] ${message.from} ${message.messageId}${tags.length > 0 ? ` (${tags.join("; ")})` : ""}`,
      `  ${previewBody(message.body)}`,
    )
  })
  lines.push(remainingLine(messages.length, remaining, true))
  return lines.join("\n")
}

/** Honest tail line: partial reads name what is shown and what is left; full reads close out. */
function remainingLine(shown: number, remaining: number, peek: boolean): string {
  // Peeked output stays unread, so `remaining` includes what is shown.
  if (peek && remaining > shown) {
    return `${plural(shown, "message")} shown of ${plural(remaining, "unread message")} (still unread).`
  }
  if (!peek && shown > 0 && remaining > 0) {
    return `${plural(shown, "message")} shown, ${plural(remaining, "unread message")} still unread.`
  }
  return `${plural(remaining, "unread message")} remain${remaining === 1 ? "s" : ""}.`
}

export function formatBatch(messages: BoardMessage[], remaining: number, peek: boolean): string {
  if (messages.length === 0) return "ttt: no unread messages."
  const lines = [`ttt: ${plural(messages.length, "message")}${peek ? " (peek; still unread)" : ""}`]
  messages.forEach((message, index) => {
    const reply = message.replyExpected ? `reply: ttt reply ${message.messageId} -- MESSAGE` : "reply: none needed"
    const tags = messageTags(message, false)
    lines.push(
      "",
      `[${index + 1}/${messages.length}] ${message.from} ${message.messageId}  ${reply}`,
      ...(tags.length > 0 ? [`(${tags.join("; ")})`] : []),
      message.body,
      "---",
    )
  })
  lines.push(remainingLine(messages.length, remaining, peek))
  return lines.join("\n")
}

export function formatStatus(message: BoardMessage, receipts: MessageReceipt[]): string {
  const byRecipient = new Map(receipts.map((receipt) => [receipt.recipient, receipt]))
  const lines = [
    `${message.messageId} from ${message.from}, ${message.priority}, thread ${message.threadId}, ${message.replyExpected ? "reply expected" : "no reply needed"}`,
    "stamps: q queued, n notified, r read, a acked",
  ]
  for (const recipient of message.recipients) {
    const receipt = byRecipient.get(recipient)
    if (!receipt) {
      lines.push(`${recipient}: missing receipt`)
      continue
    }
    const foreign = [receipt.readBy, receipt.ackedBy].find((actor) => actor && actor.window !== recipient)?.window
    const stamps = [
      `q ${shortStamp(receipt.enqueuedAt)}`,
      ...(receipt.notifiedAt ? [`n ${shortStamp(receipt.notifiedAt)}`] : []),
      ...(receipt.readAt ? [`r ${shortStamp(receipt.readAt)}`] : []),
      ...(receipt.ackedAt ? [`a ${shortStamp(receipt.ackedAt)}`] : []),
      ...(receipt.ackNote ? [`note ${JSON.stringify(receipt.ackNote)}`] : []),
      ...(foreign ? [`by ${foreign}`] : []),
      ...(receipt.supersededBy ? [`superseded by ${receipt.supersededBy}`] : []),
      ...(!receipt.supersededBy && receipt.supersededAt ? ["expired"] : []),
    ]
    lines.push(`${recipient}: ${receipt.state}  ${stamps.join("  ")}`)
  }
  return lines.join("\n")
}

/** Every thread resolves a topic: explicit `--subject` wins, else the root body's first line. */
export function topicOf(root: BoardMessage): string {
  return root.subject ?? previewBody(root.body, 80)
}

export function formatThread(messages: BoardMessage[], members: string[]): string {
  const first = messages[0]
  if (!first) return "ttt: empty thread."
  const lines = [`thread ${first.threadId} (${plural(messages.length, "message")}) topic: ${topicOf(first)} members: ${members.join(", ")}`]
  for (const message of messages) {
    const reply = message.replyExpected ? `reply: ttt reply ${message.messageId} -- MESSAGE` : "reply: none needed"
    lines.push(
      "",
      `${shortStamp(message.timestamp)} ${message.from} -> ${message.recipients.join(", ")} [${message.messageId}]${message.inReplyTo ? ` re: ${message.inReplyTo}` : ""}`,
      reply,
      message.body,
      "---",
    )
  }
  return lines.join("\n")
}

/** Thread triage: headers + one-line previews, no bodies. */
export function formatThreadHeaders(messages: BoardMessage[], members: string[]): string {
  const first = messages[0]
  if (!first) return "ttt: empty thread."
  const lines = [`thread ${first.threadId} (${plural(messages.length, "message")}) topic: ${topicOf(first)} members: ${members.join(", ")} (headers)`]
  messages.forEach((message, index) => {
    const reply = message.replyExpected ? `reply: ttt reply ${message.messageId} -- MESSAGE` : "reply: none needed"
    lines.push(
      `[${index + 1}/${messages.length}] ${shortStamp(message.timestamp)} ${message.from} [${message.messageId}]`,
      `  ${previewBody(message.body)}`,
      `  ${reply}`,
    )
  })
  return lines.join("\n")
}
