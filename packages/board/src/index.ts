export { Board } from "./board.ts"
export type {
  BoardOptions,
  CancelResult,
  InboxSummary,
  NotificationSummary,
  PruneOptions,
  PruneResult,
  ReadOptions,
  ReadResult,
  SendOptions,
  SendResult,
  WaitTimeout,
  WaitTimeoutInput,
} from "./board.ts"
export {
  BOARD_VERSION,
  MessageKind,
  MessagePriority,
  NAME_RE,
  PRESENCE_STALE_AFTER_MS,
  ReceiptState,
  WAIT_RAMP_STEP_S,
  assertName,
  makeMessageId,
  messageDay,
} from "./model.ts"
export type { Actor, BoardMessage, MessageReceipt, NotificationMarker, Presence, WaitStreak } from "./model.ts"
export type { LockOptions } from "./store.ts"
export { isErrno } from "./store.ts"
