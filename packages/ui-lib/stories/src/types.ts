import type {
  BoardMessage, DoctorFinding, LayoutFile, MessageReceipt, NotificationMarker,
  NotificationSummary, PanesView, Presence, ReadResult, SchemaLedger, SequenceCounter,
  SessionRecord, SettingsFile, TreeSession, UnreadCounter, WaitStreak,
} from "@ttt/ui"

export interface BoardSnapshot {
  name: string
  messages: BoardMessage[]
  threads: Record<string, string[]>
  receipts: MessageReceipt[]
  presences: Record<string, Presence>
  streaks: Record<string, WaitStreak>
  notifications: Record<string, NotificationMarker>
  notificationSummaries: Record<string, NotificationSummary>
  counters: Record<string, UnreadCounter>
  sequenceCounters: Record<string, SequenceCounter>
  ledger?: SchemaLedger
  readResults: Record<string, ReadResult>
}

export interface ViewerSnapshot {
  boards: BoardSnapshot[]
  sessions: TreeSession[]
  sessionRecords: SessionRecord[]
  panesViews: PanesView[]
  layouts: Record<string, LayoutFile>
  settings: SettingsFile
  findings: DoctorFinding[]
  captures: Record<string, string>
  geometry: Record<string, string>
}
