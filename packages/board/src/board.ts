import { randomUUID } from "node:crypto"
import { readdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

import {
  BOARD_VERSION,
  MessagePriority,
  RECEIPT_VERSION,
  ReceiptState,
  assertName,
  makeMessageId,
  messageDay,
} from "./model.ts"
import type {
  BoardMessage,
  MessageKind,
  MessageReceipt,
  NotificationMarker,
} from "./model.ts"
import { atomicWriteJson, isErrno, readJsonIfExists, readJsonTree, sweepTempFiles, withDirectoryLock } from "./store.ts"
import type { LockOptions } from "./store.ts"

export interface BoardOptions {
  /** Directory holding this tmux session's board: messages, mailboxes, state, locks. */
  sessionRoot: string
  /** Batching window: a target gets one notification per burst of normal messages. */
  notifySeconds: number
  lock: LockOptions
}

export interface SendOptions {
  kind: MessageKind
  priority: MessagePriority
  replyExpected: boolean
  replaceKey?: string
  inReplyTo?: string
}

export interface SendResult {
  message: BoardMessage
  /** Notification markers created by this send; the caller schedules a notifier per marker. */
  notifications: NotificationMarker[]
}

export interface ReadOptions {
  max: number
  /** Return messages without marking them read. */
  peek: boolean
  /** Pick the newest `max` instead of the oldest. */
  latest: boolean
}

export interface ReadResult {
  messages: BoardMessage[]
  remaining: number
}

export interface PruneOptions {
  olderThanMs: number
  /** Count only; delete nothing. */
  dryRun: boolean
}

export interface PruneResult {
  messages: number
  receipts: number
}

export type InboxSummary = Record<ReceiptState, number>

export interface NotificationSummary {
  target: string
  newCount: number
  unreadTotal: number
  senders: { name: string; count: number }[]
}

interface Unread {
  receipt: MessageReceipt
  message: BoardMessage
}

/**
 * The durable message board for one tmux session. Pure filesystem: delivering text to a window is
 * delegated to the `deliver` callbacks so this package never depends on tmux.
 */
export class Board {
  private readonly options: BoardOptions
  private readonly messagesRoot: string
  private readonly mailboxesRoot: string
  private readonly stateRoot: string
  private readonly locksRoot: string
  private readonly threadsRoot: string

  constructor(options: BoardOptions) {
    this.options = options
    this.messagesRoot = join(options.sessionRoot, "messages")
    this.mailboxesRoot = join(options.sessionRoot, "mailboxes")
    this.stateRoot = join(options.sessionRoot, "state")
    this.locksRoot = join(options.sessionRoot, "locks")
    this.threadsRoot = join(options.sessionRoot, "threads")
  }

  async send(from: string, recipients: string[], body: string, options: SendOptions): Promise<SendResult> {
    const targets = [...new Set(recipients)]
    if (targets.length === 0) throw new Error("no delivery targets")
    if (!body.trim()) throw new Error("message cannot be empty")
    assertName(from, "sender name")
    for (const target of targets) assertName(target, "target window name")

    const createdAt = new Date()
    const messageId = makeMessageId(createdAt)
    const message: BoardMessage = {
      boardVersion: BOARD_VERSION,
      messageId,
      threadId: options.inReplyTo ? (await this.findMessage(options.inReplyTo)).threadId : messageId,
      kind: options.kind,
      timestamp: createdAt.toISOString(),
      from,
      recipients: targets,
      ...(options.inReplyTo ? { inReplyTo: options.inReplyTo } : {}),
      replyExpected: options.replyExpected,
      priority: options.priority,
      ...(options.replaceKey ? { replaceKey: options.replaceKey } : {}),
      body,
    }
    await atomicWriteJson(this.messagePath(messageId, messageDay(messageId)!), message)
    await this.appendThreadIndex(message.threadId, messageId)

    const notifications: NotificationMarker[] = []
    for (const target of targets) {
      const marker = await this.withMailboxLock(target, async() => {
        if (message.replaceKey) await this.supersedeUnlocked(message, target)
        await this.writeReceipt({
          receiptVersion: RECEIPT_VERSION,
          messageId,
          recipient: target,
          enqueuedAt: message.timestamp,
          state: ReceiptState.Unread,
          seq: await this.nextSeqUnlocked(target),
        })
        return options.priority === MessagePriority.Normal ? this.ensureMarkerUnlocked(target) : undefined
      })
      if (marker) notifications.push(marker)
    }
    return { message, notifications }
  }

  async read(agent: string, options: ReadOptions): Promise<ReadResult> {
    return this.withMailboxLock(agent, async() => {
      const byTime = (a: Unread, b: Unread): number =>
        a.message.timestamp.localeCompare(b.message.timestamp)
        || (a.receipt.seq ?? 0) - (b.receipt.seq ?? 0)
        || a.message.messageId.localeCompare(b.message.messageId)
      const unread = (await this.unreadUnlocked(agent)).sort(byTime)
      const selected = options.latest ? unread.slice(-options.max) : unread.slice(0, options.max)

      if (!options.peek) {
        const readAt = new Date().toISOString()
        for (const { receipt } of selected) {
          await this.writeReceipt({ ...receipt, state: ReceiptState.Read, readAt })
        }
      }
      const remaining = unread.length - (options.peek ? 0 : selected.length)
      return { messages: selected.map((item) => item.message), remaining }
    })
  }

  async unreadCount(agent: string): Promise<number> {
    return this.withMailboxLock(agent, async() => (await this.unreadUnlocked(agent)).length)
  }

  async inboxSummary(agent: string): Promise<InboxSummary> {
    return this.withMailboxLock(agent, async() => {
      const summary: InboxSummary = { unread: 0, read: 0, acked: 0, superseded: 0 }
      for (const receipt of await this.receiptsUnlocked(agent)) summary[receipt.state] += 1
      return summary
    })
  }

  async ack(agent: string, messageId: string, note?: string): Promise<MessageReceipt> {
    return this.withMailboxLock(agent, async() => {
      const receipt = await readJsonIfExists<MessageReceipt>(this.receiptPath(agent, messageId))
      if (!receipt) throw new Error(`message ${messageId} is not in ${agent}'s mailbox`)
      if (receipt.state === ReceiptState.Superseded) {
        throw new Error(`message ${messageId} was superseded by ${receipt.supersededBy ?? "another message"}`)
      }
      const ackedAt = new Date().toISOString()
      const acked: MessageReceipt = {
        ...receipt,
        state: ReceiptState.Acked,
        ackedAt,
        readAt: receipt.readAt ?? ackedAt,
        ...(note?.trim() ? { ackNote: note.trim() } : {}),
      }
      await this.writeReceipt(acked)
      return acked
    })
  }

  /** Marks every unacked, non-superseded receipt in `agent`'s mailbox acked. One lock, one timestamp. */
  async ackAll(agent: string, note?: string): Promise<MessageReceipt[]> {
    return this.withMailboxLock(agent, async() => {
      const ackedAt = new Date().toISOString()
      const clean = note?.trim() ? note.trim() : undefined
      const acked: MessageReceipt[] = []
      const receipts = (await this.receiptsUnlocked(agent)).sort((a, b) =>
        a.enqueuedAt.localeCompare(b.enqueuedAt) || a.messageId.localeCompare(b.messageId))
      for (const receipt of receipts) {
        if (receipt.state !== ReceiptState.Unread && receipt.state !== ReceiptState.Read) continue
        const next: MessageReceipt = {
          ...receipt,
          state: ReceiptState.Acked,
          ackedAt,
          readAt: receipt.readAt ?? ackedAt,
          ...(clean ? { ackNote: clean } : {}),
        }
        await this.writeReceipt(next)
        acked.push(next)
      }
      return acked
    })
  }

  async messageStatus(messageId: string): Promise<{ message: BoardMessage; receipts: MessageReceipt[] }> {
    const message = await this.findMessage(messageId)
    const receipts: MessageReceipt[] = []
    for (const recipient of message.recipients) {
      const receipt = await readJsonIfExists<MessageReceipt>(this.receiptPath(recipient, messageId))
      if (receipt) receipts.push(receipt)
    }
    return { message, receipts }
  }

  async thread(messageId: string): Promise<BoardMessage[]> {
    const { threadId } = await this.findMessage(messageId)
    const indexed = await this.readThreadIndex(threadId)
    if (indexed) {
      const messages: BoardMessage[] = []
      for (const id of indexed) {
        try {
          messages.push(await this.findMessage(id))
        } catch {
          // Pruned messages drop out of the thread; the rest still resolve.
        }
      }
      if (messages.length > 0) {
        return messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.messageId.localeCompare(b.messageId))
      }
    }
    // Fallback for threads written before the index existed; rebuilds it best-effort.
    const scanned = (await readJsonTree<BoardMessage>(this.messagesRoot))
      .filter((message) => message.threadId === threadId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.messageId.localeCompare(b.messageId))
    if (scanned.length > 0) {
      await this.writeThreadIndex(threadId, scanned.map((message) => message.messageId)).catch(() => undefined)
    }
    return scanned
  }

  // ponytail: ids always embed their day shard, so lookups are one direct read; no tree walk fallback.
  async findMessage(messageId: string): Promise<BoardMessage> {
    const day = messageDay(messageId)
    const message = day ? await readJsonIfExists<BoardMessage>(this.messagePath(messageId, day)) : undefined
    if (!message) throw new Error(`message not found: ${messageId}`)
    return message
  }

  /** Ensure a batched notification is pending for `target` (used as the fallback when urgent paste fails). */
  async scheduleNotification(target: string): Promise<NotificationMarker | undefined> {
    return this.withMailboxLock(target, () => this.ensureMarkerUnlocked(target))
  }

  /** Best-effort removal of crashed-writer temp files under this session root. Never throws. */
  async sweepTempFiles(): Promise<number> {
    try {
      return await sweepTempFiles(this.options.sessionRoot, 3_600_000)
    } catch {
      return 0
    }
  }

  /** Deletes a notification marker only when its token still matches; used to clean up after a failed spawn. */
  async cancelNotification(target: string, token: string): Promise<boolean> {
    return this.withMailboxLock(target, async() => {
      const marker = await readJsonIfExists<NotificationMarker>(this.markerPath(target))
      if (marker?.token !== token) return false
      await rm(this.markerPath(target), { force: true })
      return true
    })
  }

  /**
   * Garbage-collects terminal history: messages older than the cutoff whose every listed recipient holds a
   * terminal (acked/superseded) receipt at least that old, plus orphan terminal receipts whose message is gone.
   * Unread/read history is never touched. Message files are removed before their receipts so a crash leaves
   * orphan receipts (reaped next run) rather than untracked messages.
   */
  async prune(options: PruneOptions): Promise<PruneResult> {
    const cutoff = Date.now() - options.olderThanMs
    const terminal = (receipt: MessageReceipt | undefined): receipt is MessageReceipt => {
      if (!receipt || (receipt.state !== ReceiptState.Acked && receipt.state !== ReceiptState.Superseded)) return false
      return Date.parse(receipt.ackedAt ?? receipt.supersededAt ?? receipt.enqueuedAt) <= cutoff
    }
    let messages = 0
    let receipts = 0
    for (const message of await readJsonTree<BoardMessage>(this.messagesRoot)) {
      if (Date.parse(message.timestamp) > cutoff) continue
      const states = await Promise.all(message.recipients.map(async(recipient) => ({
        recipient,
        receipt: await readJsonIfExists<MessageReceipt>(this.receiptPath(recipient, message.messageId)),
      })))
      if (!states.every((entry) => terminal(entry.receipt))) continue
      if (!options.dryRun) {
        await rm(this.messagePath(message.messageId, messageDay(message.messageId)!), { force: true }).catch(() => undefined)
        await this.removeFromThreadIndex(message.threadId, message.messageId).catch(() => undefined)
        for (const entry of states) {
          try {
            await this.withMailboxLock(entry.recipient, async() => {
              const current = await readJsonIfExists<MessageReceipt>(this.receiptPath(entry.recipient, message.messageId))
              if (current && (current.state === ReceiptState.Acked || current.state === ReceiptState.Superseded)) {
                await rm(this.receiptPath(entry.recipient, message.messageId), { force: true })
                receipts += 1
              }
            })
          } catch {
            // A busy mailbox keeps its receipt; the orphan sweep reaps it on a later run.
          }
        }
      } else {
        receipts += states.length
      }
      messages += 1
    }
    for (const mailbox of await this.mailboxNames()) {
      try {
        await this.withMailboxLock(mailbox, async() => {
          for (const receipt of await this.receiptsUnlocked(mailbox)) {
            if (!terminal(receipt)) continue
            const day = messageDay(receipt.messageId)
            if (day && await readJsonIfExists(this.messagePath(receipt.messageId, day))) continue
            if (!options.dryRun) await rm(this.receiptPath(mailbox, receipt.messageId), { force: true })
            receipts += 1
          }
        })
      } catch {
        // A busy mailbox is skipped; pruning is best-effort and rerunnable.
      }
    }
    return { messages, receipts }
  }

  /**
   * Runs in the detached notifier: waits out the batching window, then (if this token is still the live
   * marker and there are unnotified messages) calls `deliver` once and marks every unread receipt notified.
   * Returns false when nothing was delivered.
   */
  async deliverNotification(
    target: string,
    token: string,
    deliver: (summary: NotificationSummary) => Promise<void>,
  ): Promise<boolean> {
    const markerPath = this.markerPath(target)
    const pending = await readJsonIfExists<NotificationMarker>(markerPath)
    if (pending?.token !== token) return false
    await sleep(pending.delaySeconds * 1_000)

    return this.withMailboxLock(target, async() => {
      const marker = await readJsonIfExists<NotificationMarker>(markerPath)
      if (marker?.token !== token) return false

      const unread = await this.unreadUnlocked(target)
      const fresh = unread.filter((item) => !item.receipt.notifiedAt)
      if (fresh.length === 0) {
        await rm(markerPath, { force: true })
        return false
      }

      const counts = new Map<string, number>()
      for (const { message } of fresh) counts.set(message.from, (counts.get(message.from) ?? 0) + 1)
      await deliver({
        target,
        newCount: fresh.length,
        unreadTotal: unread.length,
        senders: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({ name, count })),
      })

      const notifiedAt = new Date().toISOString()
      for (const { receipt } of fresh) await this.writeReceipt({ ...receipt, notifiedAt })
      await rm(markerPath, { force: true })
      return true
    })
  }

  /** Pushes an urgent message straight to its recipient; the receipt stays unread until they `read`. */
  async deliverUrgent(
    message: BoardMessage,
    recipient: string,
    deliver: (message: BoardMessage) => Promise<void>,
  ): Promise<void> {
    await this.withMailboxLock(recipient, async() => {
      const receipt = await readJsonIfExists<MessageReceipt>(this.receiptPath(recipient, message.messageId))
      if (receipt?.state !== ReceiptState.Unread) return
      await deliver(message)
      await this.writeReceipt({ ...receipt, notifiedAt: new Date().toISOString() })
    })
  }

  private messagePath(messageId: string, day: string): string {
    return join(this.messagesRoot, day, `${messageId}.json`)
  }

  private receiptPath(agent: string, messageId: string): string {
    return join(this.mailboxesRoot, agent, `${messageId}.json`)
  }

  private markerPath(agent: string): string {
    return join(this.stateRoot, `${agent}.notification.json`)
  }

  private threadPath(threadId: string): string {
    return join(this.threadsRoot, `${threadId}.json`)
  }

  private async withThreadLock<T>(threadId: string, callback: () => Promise<T>): Promise<T> {
    assertName(threadId, "thread id")
    return withDirectoryLock(join(this.locksRoot, `thread-${threadId}.lock`), this.options.lock, callback)
  }

  private async readThreadIndex(threadId: string): Promise<string[] | undefined> {
    return readJsonIfExists<string[]>(this.threadPath(threadId))
  }

  private async writeThreadIndex(threadId: string, messageIds: string[]): Promise<void> {
    await this.withThreadLock(threadId, () => atomicWriteJson(this.threadPath(threadId), messageIds))
  }

  private async appendThreadIndex(threadId: string, messageId: string): Promise<void> {
    await this.withThreadLock(threadId, async() => {
      const existing = await readJsonIfExists<string[]>(this.threadPath(threadId)) ?? []
      if (!existing.includes(messageId)) await atomicWriteJson(this.threadPath(threadId), [...existing, messageId])
    })
  }

  private async removeFromThreadIndex(threadId: string, messageId: string): Promise<void> {
    await this.withThreadLock(threadId, async() => {
      const existing = await readJsonIfExists<string[]>(this.threadPath(threadId))
      if (!existing) return
      const kept = existing.filter((id) => id !== messageId)
      if (kept.length === 0) await rm(this.threadPath(threadId), { force: true })
      else await atomicWriteJson(this.threadPath(threadId), kept)
    })
  }

  private async mailboxNames(): Promise<string[]> {
    try {
      const entries = await readdir(this.mailboxesRoot, { withFileTypes: true })
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    } catch(error) {
      if (isErrno(error, "ENOENT")) return []
      throw error
    }
  }

  private seqPath(agent: string): string {
    return join(this.stateRoot, `${agent}.seq.json`)
  }

  /** Monotonic per-mailbox enqueue order. Runs under the mailbox lock; missing counters start at 1. */
  private async nextSeqUnlocked(agent: string): Promise<number> {
    const current = await readJsonIfExists<{ next: number }>(this.seqPath(agent))
    const seq = current?.next ?? 1
    await atomicWriteJson(this.seqPath(agent), { next: seq + 1 })
    return seq
  }

  private async withMailboxLock<T>(agent: string, callback: () => Promise<T>): Promise<T> {
    assertName(agent, "agent name")
    return withDirectoryLock(join(this.locksRoot, `${agent}.lock`), this.options.lock, callback)
  }

  private async writeReceipt(receipt: MessageReceipt): Promise<void> {
    await atomicWriteJson(this.receiptPath(receipt.recipient, receipt.messageId), receipt)
  }

  private async receiptsUnlocked(agent: string): Promise<MessageReceipt[]> {
    return readJsonTree<MessageReceipt>(join(this.mailboxesRoot, agent))
  }

  private async unreadUnlocked(agent: string): Promise<Unread[]> {
    const unread: Unread[] = []
    for (const receipt of await this.receiptsUnlocked(agent)) {
      if (receipt.state !== ReceiptState.Unread) continue
      try {
        unread.push({ receipt, message: await this.findMessage(receipt.messageId) })
      } catch {
        // A missing message must not make the whole inbox unusable.
      }
    }
    return unread
  }

  private async supersedeUnlocked(replacement: BoardMessage, recipient: string): Promise<void> {
    const supersededAt = new Date().toISOString()
    for (const { receipt, message } of await this.unreadUnlocked(recipient)) {
      if (message.from !== replacement.from || message.replaceKey !== replacement.replaceKey) continue
      await this.writeReceipt({
        ...receipt,
        state: ReceiptState.Superseded,
        supersededAt,
        supersededBy: replacement.messageId,
      })
    }
  }

  /** Returns a new marker when one must be scheduled; undefined when a live notifier already covers it. */
  private async ensureMarkerUnlocked(target: string): Promise<NotificationMarker | undefined> {
    const markerPath = this.markerPath(target)
    const existing = await readJsonIfExists<NotificationMarker>(markerPath)
    if (existing) {
      const ageMs = Date.now() - Date.parse(existing.createdAt)
      const staleAfterMs = (existing.delaySeconds + 30) * 1_000
      if (Number.isFinite(ageMs) && ageMs <= staleAfterMs) return undefined
    }
    const marker: NotificationMarker = {
      token: randomUUID(),
      target,
      createdAt: new Date().toISOString(),
      delaySeconds: this.options.notifySeconds,
    }
    await atomicWriteJson(markerPath, marker)
    return marker
  }
}
