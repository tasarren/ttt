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
  const { messages, remaining } = await ctx.board.read(ctx.senderName, { max, peek: values.peek || headersOnly, latest: values.latest })
  process.stdout.write(`${headersOnly ? formatHeaders(messages, remaining) : formatBatch(messages, remaining, values.peek)}\n`)
}

const INBOX_OPTIONS = {
  count: { type: "boolean", default: false },
  detail: { type: "boolean", default: false },
  max: { type: "string" },
} as const

export const inbox: Handler = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, INBOX_OPTIONS)
  if (positionals.length > 0) throw usageError("inbox takes no positional arguments")
  if (values.count && values.detail) throw usageError("--count cannot be combined with --detail")
  if (values.count) {
    const summary = await ctx.board.inboxSummary(ctx.senderName)
    process.stdout.write(`${summary.unread}\n`)
    return
  }
  if (values.detail) {
    const max = boundedInt(values.max, "--max", ctx.settings.readMax, 1_000)
    const { messages, remaining } = await ctx.board.read(ctx.senderName, { max, peek: true, latest: false })
    process.stdout.write(`${formatHeaders(messages, remaining)}\n`)
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
    const receipts = await ctx.board.ackAll(ctx.senderName, dashNote)
    for (const receipt of receipts) process.stdout.write(`acked ${receipt.messageId}\n`)
    if (receipts.length === 0) process.stdout.write("ttt: nothing to ack.\n")
    return
  }
  const [messageId, ...bareNote] = positionals
  if (messageId === undefined) throw usageError("usage: ttt ack MESSAGE_ID [-- NOTE]")
  const note = [...bareNote, ...(body ?? [])].join(" ") || undefined
  const prior = await ctx.board.messageStatus(messageId).catch(() => undefined)
  const receipt = await ctx.board.ack(ctx.senderName, messageId, note)
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

export const thread: Handler = async(argv, ctx) => {
  const { positionals } = parseCommandArgs(argv, {} as const)
  const [messageId, ...extra] = positionals
  if (messageId === undefined || extra.length > 0) throw usageError("usage: ttt thread MESSAGE_ID")
  process.stdout.write(`${formatThread(await ctx.board.thread(messageId))}\n`)
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

/** Headers + one-line previews, without bodies and without marking anything read. */
export function formatHeaders(messages: BoardMessage[], remaining: number): string {
  if (messages.length === 0) return "ttt: no unread messages."
  const lines = [`ttt: ${plural(messages.length, "message")} (headers; still unread)`]
  messages.forEach((message, index) => {
    const tags = [
      ...(message.replyExpected ? [] : ["no-reply"]),
      ...(message.inReplyTo ? [`re: ${message.inReplyTo}`] : []),
      ...(message.replaceKey ? [`replace: ${message.replaceKey}`] : []),
    ]
    lines.push(
      `[${index + 1}/${messages.length}] ${message.from} ${message.messageId}${tags.length > 0 ? ` (${tags.join("; ")})` : ""}`,
      `  ${previewBody(message.body)}`,
    )
  })
  lines.push(`${plural(remaining, "unread message")} remain${remaining === 1 ? "s" : ""}.`)
  return lines.join("\n")
}

export function formatBatch(messages: BoardMessage[], remaining: number, peek: boolean): string {
  if (messages.length === 0) return "ttt: no unread messages."
  const lines = [`ttt: ${plural(messages.length, "message")}${peek ? " (peek; still unread)" : ""}`]
  messages.forEach((message, index) => {
    const reply = message.replyExpected ? `reply: ttt reply ${message.messageId} -- MESSAGE` : "no reply needed"
    const tags = [
      ...(message.inReplyTo ? [`re: ${message.inReplyTo}`] : []),
      ...(message.replaceKey ? [`replace: ${message.replaceKey}`] : []),
    ]
    lines.push(
      "",
      `[${index + 1}/${messages.length}] ${message.from} ${message.messageId}  ${reply}`,
      ...(tags.length > 0 ? [`(${tags.join("; ")})`] : []),
      message.body,
      "---",
    )
  })
  lines.push(`${plural(remaining, "unread message")} remain${remaining === 1 ? "s" : ""}.`)
  return lines.join("\n")
}

export function formatStatus(message: BoardMessage, receipts: MessageReceipt[]): string {
  const byRecipient = new Map(receipts.map((receipt) => [receipt.recipient, receipt]))
  const lines = [`${message.messageId} from ${message.from}, ${message.priority}, thread ${message.threadId}`]
  for (const recipient of message.recipients) {
    const receipt = byRecipient.get(recipient)
    if (!receipt) {
      lines.push(`${recipient}: missing receipt`)
      continue
    }
    const stamps = [
      `q ${shortStamp(receipt.enqueuedAt)}`,
      ...(receipt.notifiedAt ? [`n ${shortStamp(receipt.notifiedAt)}`] : []),
      ...(receipt.readAt ? [`r ${shortStamp(receipt.readAt)}`] : []),
      ...(receipt.ackedAt ? [`a ${shortStamp(receipt.ackedAt)}`] : []),
      ...(receipt.ackNote ? [`note ${JSON.stringify(receipt.ackNote)}`] : []),
      ...(receipt.supersededBy ? [`superseded by ${receipt.supersededBy}`] : []),
    ]
    lines.push(`${recipient}: ${receipt.state}  ${stamps.join("  ")}`)
  }
  return lines.join("\n")
}

export function formatThread(messages: BoardMessage[]): string {
  const first = messages[0]
  if (!first) return "ttt: empty thread."
  const lines = [`thread ${first.threadId} (${plural(messages.length, "message")})`]
  for (const message of messages) {
    lines.push(
      "",
      `${shortStamp(message.timestamp)} ${message.from} -> ${message.recipients.join(", ")} [${message.messageId}]${message.inReplyTo ? ` re: ${message.inReplyTo}` : ""}`,
      message.body,
      "---",
    )
  }
  return lines.join("\n")
}
