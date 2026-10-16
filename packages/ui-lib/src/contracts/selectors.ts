import type { BoardMessage, InboxSummary, MessageReceipt, MessageStatus, TreeSession } from "./types.ts"

export const receiptStates = [
  "unread", "read", "acked", "superseded", "cancelled",
] as const
export const messageKinds = [
  "message", "reply", "broadcast",
] as const
export const priorities = [
  "normal", "urgent",
] as const
export const severities = [
  "ok", "warn", "fail",
] as const
export function orderedMessages(index: readonly string[], messages: readonly BoardMessage[]): BoardMessage[] {
  const byId = new Map(messages.map(m => [
    m.messageId, m,
  ]))
  return index.flatMap(id => byId.has(id) ? [
    byId.get(id)!,
  ] : [])
}
export function summarizeReceipts(receipts: readonly MessageReceipt[]): InboxSummary {
  const result: InboxSummary = {
    unread: 0, read: 0, acked: 0, superseded: 0, cancelled: 0,
  }
  for (const receipt of receipts)
    result[receipt.state]++
  return result
}
export function receiptRows(status: MessageStatus) {
  return status.message.recipients.map(recipient => ({
    recipient, receipt: status.receipts.find(r => r.recipient === recipient),
  }))
}
export function threadSummaries(messages: readonly BoardMessage[], threads: Record<string, string[]>) {
  return Object.entries(threads).map(([id, index]) => {
    const ordered = orderedMessages(index, messages)
    const root = ordered.find(m => m.messageId === id)
    return {
      id, root, messages: ordered, count: index.length, missing: index.filter(x => !ordered.some(m => m.messageId === x)), participants: [
        ...new Set(ordered.flatMap(m => [
          m.from, ...m.recipients,
        ])),
      ], last: ordered.at(-1),
    }
  })
}
export interface TimelineEntry {
  id: string
  timestamp: string
  type: string
  actor: string
  messageId: string
  detail: string
}
export function timeline(messages: readonly BoardMessage[], receipts: readonly MessageReceipt[]): TimelineEntry[] {
  const entries: TimelineEntry[] = messages.map(m => ({
    id: `${m.messageId}:created`, timestamp: m.timestamp, type: m.kind, actor: m.from, messageId: m.messageId, detail: m.subject || m.body.slice(0, 140),
  }))
  const fields = [
    "enqueuedAt", "notifiedAt", "readAt", "ackedAt", "supersededAt", "cancelledAt",
  ] as const
  for (const r of receipts)
    for (const field of fields) {
      if (r[field])
        entries.push({
          id: `${r.messageId}:${r.recipient}:${field}`, timestamp: r[field], type: field.replace("At", ""), actor: r.recipient, messageId: r.messageId, detail: field === "ackedAt" ? r.ackNote || "Acknowledged" : field === "supersededAt" ? `Replaced by ${r.supersededBy || "not recorded"}` : "",
        })
    }
  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id))
}
export function groupProjects(sessions: readonly TreeSession[]) {
  const groups = new Map<string, {
    cwd: string
    sessions: string[]
    panes: number
  }>()
  for (const session of sessions)
    for (const window of session.windows)
      for (const pane of window.panes) {
        if (!pane.cwd)
          continue
        const group = groups.get(pane.cwd) || {
          cwd: pane.cwd, sessions: [], panes: 0,
        }
        if (!group.sessions.includes(session.name))
          group.sessions.push(session.name)
        group.panes++
        groups.set(pane.cwd, group)
      }
  return [
    ...groups.values(),
  ]
}
export function displayValue(value: unknown): string {
  if (value === undefined)
    return "Not recorded"
  if (value === null)
    return "null"
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint" || typeof value === "symbol") return String(value)
  if (typeof value === "object") return JSON.stringify(value, null, 2)
  return "Not recorded"
}
