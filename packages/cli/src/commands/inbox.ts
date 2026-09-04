import type { BoardMessage, MessageReceipt } from "@ttt/board"

import { boundedInt, parseCommandArgs, splitAtTerminator } from "../args.ts"
import { usageError } from "../cli-error.ts"
import type { Handler } from "../context.ts"

const READ_OPTIONS = {
  max: { type: "string" },
  peek: { type: "boolean", default: false },
  latest: { type: "boolean", default: false },
} as const

export const read: Handler = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, READ_OPTIONS)
  if (positionals.length > 0) throw usageError("read takes no positional arguments")
  const max = boundedInt(values.max, "--max", ctx.settings.readMax, 1_000)
  const messages = await ctx.board.read(ctx.senderName, { max, peek: values.peek, latest: values.latest })
  const remaining = await ctx.board.unreadCount(ctx.senderName)
  process.stdout.write(`${formatBatch(messages, remaining, values.peek)}\n`)
}

export const inbox: Handler = async(argv, ctx) => {
  const { values } = parseCommandArgs(argv, { count: { type: "boolean", default: false } } as const)
  const summary = await ctx.board.inboxSummary(ctx.senderName)
  process.stdout.write(values.count
    ? `${summary.unread}\n`
    : `ttt inbox for ${ctx.senderName}: unread ${summary.unread}, read ${summary.read}, acked ${summary.acked}, superseded ${summary.superseded}\n`)
}

export const ack: Handler = async(argv, ctx) => {
  const { head, body } = splitAtTerminator(argv)
  const [messageId, ...extra] = head
  if (messageId === undefined || extra.length > 0) throw usageError("usage: ttt ack MESSAGE_ID [-- NOTE]")
  const receipt = await ctx.board.ack(ctx.senderName, messageId, body?.join(" "))
  process.stdout.write(`acked ${receipt.messageId}\n`)
}

export const status: Handler = async(argv, ctx) => {
  const [messageId, ...extra] = argv
  if (messageId === undefined || extra.length > 0) throw usageError("usage: ttt status MESSAGE_ID")
  const result = await ctx.board.messageStatus(messageId)
  process.stdout.write(`${formatStatus(result.message, result.receipts)}\n`)
}

export const thread: Handler = async(argv, ctx) => {
  const [messageId, ...extra] = argv
  if (messageId === undefined || extra.length > 0) throw usageError("usage: ttt thread MESSAGE_ID")
  process.stdout.write(`${formatThread(await ctx.board.thread(messageId))}\n`)
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
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
      `queued ${receipt.enqueuedAt}`,
      ...(receipt.notifiedAt ? [`notified ${receipt.notifiedAt}`] : []),
      ...(receipt.readAt ? [`read ${receipt.readAt}`] : []),
      ...(receipt.ackedAt ? [`acked ${receipt.ackedAt}`] : []),
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
      `${message.timestamp} ${message.from} -> ${message.recipients.join(", ")} [${message.messageId}]${message.inReplyTo ? ` re: ${message.inReplyTo}` : ""}`,
      message.body,
      "---",
    )
  }
  return lines.join("\n")
}
