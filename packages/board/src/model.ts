import { randomBytes } from "node:crypto"

export const BOARD_VERSION = 6
export const RECEIPT_VERSION = 1

export const MessageKind = {
  Message: "message",
  Reply: "reply",
  Broadcast: "broadcast",
} as const
export type MessageKind = (typeof MessageKind)[keyof typeof MessageKind]

export const MessagePriority = {
  Normal: "normal",
  Urgent: "urgent",
} as const
export type MessagePriority = (typeof MessagePriority)[keyof typeof MessagePriority]

export const ReceiptState = {
  Unread: "unread",
  Read: "read",
  Acked: "acked",
  Superseded: "superseded",
} as const
export type ReceiptState = (typeof ReceiptState)[keyof typeof ReceiptState]

export interface BoardMessage {
  /** Schema version of the writer; readers accept any version up to their own and refuse newer ones. */
  boardVersion: number
  messageId: string
  threadId: string
  kind: MessageKind
  timestamp: string
  from: string
  recipients: string[]
  inReplyTo?: string
  replyExpected: boolean
  priority: MessagePriority
  replaceKey?: string
  /** Thread subject, set once on the root message via `send --subject`. */
  subject?: string
  body: string
}

export interface MessageReceipt {
  receiptVersion: typeof RECEIPT_VERSION
  messageId: string
  recipient: string
  enqueuedAt: string
  state: ReceiptState
  /** Per-mailbox enqueue order; assigned under the mailbox lock. Older receipts may lack it. */
  seq?: number
  notifiedAt?: string
  readAt?: string
  ackedAt?: string
  ackNote?: string
  supersededAt?: string
  supersededBy?: string
}

/** One pending batched notification per target; the token lets a stale notifier detect it was replaced. */
export interface NotificationMarker {
  token: string
  target: string
  createdAt: string
  delaySeconds: number
}

/** Window, agent, and session names double as directory names, so keep them to a safe charset. */
export const NAME_RE = /^[A-Za-z0-9_-]+$/

export function assertName(value: string, label: string): void {
  if (!NAME_RE.test(value)) {
    throw new Error(`${label} may contain only letters, digits, underscores, and dashes: ${JSON.stringify(value)}`)
  }
}

const MESSAGE_ID_RE = /^ttt-(\d{8})-\d{6}-[0-9a-f]{8}$/

/** `ttt-YYYYMMDD-HHMMSS-hex8`: sortable, and the day shard is recoverable from the id itself. */
export function makeMessageId(date = new Date()): string {
  const compact = date.toISOString().replace(/[-:T]/g, "").slice(0, 14)
  return `ttt-${compact.slice(0, 8)}-${compact.slice(8)}-${randomBytes(4).toString("hex")}`
}

/** The `YYYYMMDD` shard of a message id, or undefined when the id is not one of ours. */
export function messageDay(messageId: string): string | undefined {
  return MESSAGE_ID_RE.exec(messageId)?.[1]
}
