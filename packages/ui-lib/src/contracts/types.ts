// Generated from docs/ttt-system.schema.json. Run pnpm --filter @ttt/ui generate; do not hand-edit.

/** Board agent, window, session, or layout name accepted by assertName. */
export type Name = string

export type MessageId = string

export type Timestamp = string

export type Actor = {
  window: string
  session: string
}

/** boards/<session>/messages/<YYYYMMDD>/<messageId>.json. Current writer uses version 7; earlier message versions may remain. One document per message, shared by all recipients. */
export type BoardMessage = {
  boardVersion: number
  messageId: MessageId
  /** Root message ID; same as messageId on the root. */
  threadId: MessageId
  kind: "message" | "reply" | "broadcast"
  timestamp: Timestamp
  from: Name
  recipients: Array<Name>
  inReplyTo?: MessageId
  replyExpected: boolean
  priority: "normal" | "urgent"
  replaceKey?: string
  /** Only the thread root stores a subject. */
  subject?: string
  /** Unread receipts expire lazily on mailbox access. */
  expiresAt?: Timestamp
  body: string
}

/** Current writer output at boards/<session>/mailboxes/<recipient>/<messageId>.json. One receipt per recipient; its state changes independently. */
export type MessageReceipt = {
  receiptVersion: 1
  messageId: MessageId
  recipient: Name
  enqueuedAt: Timestamp
  state: "unread" | "read" | "acked" | "superseded" | "cancelled"
  /** Per-mailbox enqueue order; older receipts may omit it. */
  seq?: number
  notifiedAt?: Timestamp
  readAt?: Timestamp
  ackedAt?: Timestamp
  ackNote?: string
  supersededAt?: Timestamp
  supersededBy?: MessageId
  cancelledAt?: Timestamp
  cancelledBy?: Actor
  readBy?: Actor
  ackedBy?: Actor
}

/** boards/<session>/threads/<threadId>.json, in append order. */
export type ThreadIndex = Array<MessageId>

/** Transient state/<agent>.notification.json; heartbeat updates createdAt while batching. */
export type NotificationMarker = {
  token: string
  target: Name
  createdAt: Timestamp
  delaySeconds: number
}

/** Transient state/<agent>.waiting.json. Means a live process is blocked in --wait, not general online presence. */
export type Presence = {
  pid: number
  since: Timestamp
  expect: "any" | {
    threadId: MessageId
  }
}

/** Transient state/<agent>.wait.json, reset when mail arrives. */
export type WaitStreak = {
  emptyStreak: number
  updatedAt: Timestamp
}

/** state/<agent>.unread.json; a missing file is possible before index creation. */
export type UnreadCounter = {
  count: number
}

/** state/<agent>.seq.json; next per-mailbox sequence value. */
export type SequenceCounter = {
  next: number
}

/** state/schema.json; absent on old boards without a ledger. */
export type SchemaLedger = {
  version: number
}

/** Board.inboxSummary(agent) result, counts of receipts by state. */
export type InboxSummary = {
  unread: number
  read: number
  acked: number
  superseded: number
  cancelled: number
}

/** Board.read(agent, options) result. peek avoids the read flip, but even a peek settles expired receipts. */
export type ReadResult = {
  messages: Array<BoardMessage>
  remaining: number
  cancelled: number
}

/** Board.messageStatus(messageId) result; receipts can be missing during partial delivery. */
export type MessageStatus = {
  message: BoardMessage
  receipts: Array<MessageReceipt>
}

/** Board.deliverNotification callback payload, not a persisted file. */
export type NotificationSummary = {
  target: Name
  newCount: number
  unreadTotal: number
  senders: Array<{
    name: Name
    count: number
  }>
}

/** Live ttt tmux tree --json output; not persisted. Undefined optional tmux fields are omitted by JSON.stringify. */
export type TreeSession = {
  id: string
  name: string
  attached: boolean
  group?: string
  windows: Array<TreeWindow>
}

export type TreeWindow = {
  name: string
  id: string
  index: number
  active: boolean
  panes: Array<TreePane>
}

export type TreePane = {
  session: string
  window: string
  windowId: string
  pane: string
  index: number
  pid: number
  agent?: string
  active: boolean
  dead: boolean
  cwd: string
  command: string
  title: string
  harness?: string
  startCommand?: string
  historyLimit: number
  paneTitle?: string
}

/** Live ttt panes --json output for one window. A missing agent property means a helper pane. */
export type PanesView = {
  window: string
  id: string
  panes: Array<PaneRow>
}

export type PaneRow = {
  index: number
  pane: string
  agent?: string
  seat: boolean
  registered: boolean
  runs: string
  dead: boolean
}

/** Live ttt tmux doctor --json output. */
export type DoctorFindings = Array<DoctorFinding>

export type DoctorFinding = {
  severity: "ok" | "warn" | "fail"
  subject: string
  detail: string
  fix?: string
}

/** ~/.ttt/sessions/<session>/session.json written by ttt tmux setup; may be absent for an existing tmux session. */
export type SessionRecord = {
  version: 1
  session: Name
  profile: string
  hookBin: string
  layout?: string
  createdAt: Timestamp
}

/** ~/.ttt/layouts/<name>.jsonc input. JSONC comments and trailing commas must be removed before JSON Schema validation. */
export type LayoutFile = {
  version: 1
  /** Informational; restore ignores it. */
  session?: string
  cwd?: string
  profile?: string
  windows: Array<LayoutWindow>
}

/** Without panes, ttt creates one shell pane with agent=true. Multiple panes require a matching tmux layout string. */
export type LayoutWindow = {
  name: Name
  layout?: string
  panes?: Array<LayoutPane>
}

export type LayoutPane = {
  /** Absent or null starts a plain shell; a string is its launch line. */
  command?: string | null
  /** true seats the window's main agent; a name seats a second agent; false/absent leaves it unstamped. */
  agent?: boolean | Name
  /** Helper pane only; cannot coexist with a true or named agent. */
  title?: string
  harness?: string
  cwd?: string
  source?: "process" | "tree"
}

/** ~/.ttt/settings.jsonc or settings.json input. Every key is optional; ttt fills defaults. JSONC must be parsed before schema validation. */
export type SettingsFile = {
  /** Defaults to <TTT_HOME>/boards; leading ~/ expands to the OS home. */
  boardRoot?: string
  notifySeconds?: number
  notifyOverrides?: Record<string, number>
  readMax?: number
  wait?: {
    seconds?: number
    maxSeconds?: number
    maxIdle?: number
  }
  capture?: {
    lines?: number
    maxLines?: number
  }
  lock?: {
    timeoutMs?: number
    staleMs?: number
  }
  tmux?: {
    inputSettleMs?: number
    postPasteMs?: number
    enterPresses?: number
    postSendMs?: number
    badges?: boolean
  }
  /** Absent: all shipped presets allowed, none default. Present: only listed harnesses allowed; exactly one entry must set default=true (checked by ttt). */
  harnesses?: Record<string, HarnessEntry>
}

/** Shipped presets may omit bin/ready; a new harness must provide both. ttt validates regular expression text at runtime. */
export type HarnessEntry = {
  bin?: string
  ready?: string
  /** Parsed but not yet matched by ttt. */
  limited?: string
  default?: boolean
}
