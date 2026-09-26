import api from "../openapi.json" with { type: "json" }
import { validateContract } from "@ttt/ui"
import type { BoardMessage, MessageReceipt, Presence, WaitStreak, NotificationMarker, UnreadCounter, SequenceCounter, SchemaLedger, ThreadIndex, TreeSession, SettingsFile, LayoutFile, DoctorFinding, InboxSummary } from "@ttt/ui"

export interface BoardView {
  name: string
  messages: BoardMessage[]
  receipts: MessageReceipt[]
  threads: Record<string, ThreadIndex>
  presences: Record<string, Presence>
  streaks: Record<string, WaitStreak>
  notifications: Record<string, NotificationMarker>
  counters: Record<string, UnreadCounter>
  sequenceCounters: Record<string, SequenceCounter>
  summaries: Record<string, InboxSummary>
  ledger?: SchemaLedger
}
export interface SourceDocument<T> { value: T; source: string; etag: string }
export interface WebState {
  boards: { name: string }[]
  board: BoardView | null
  sessions: TreeSession[]
  geometry: Record<string, string>
  layouts: Record<string, SourceDocument<LayoutFile>>
  settings: SourceDocument<SettingsFile>
  harnesses: string[]
  findings: DoctorFinding[]
  page: { offset: number; limit: number; total: number }
  token: string
  revision: number
}
export interface TerminalFrame { epoch: number; text: string; cols: number; rows: number }
export type TerminalEvent =
  | { type: "snapshot"; pane: string; frame: TerminalFrame }
  | { type: "output"; pane: string; epoch: number; text: string }
  | { type: "error"; message: string }
export const WebAction = {
  OpenWindow: "open-window", OpenPane: "open-pane", Close: "close", Rename: "rename", Respawn: "respawn", Interrupt: "interrupt", Save: "save", Restore: "restore", Setup: "setup",
} as const
export type WebAction = (typeof WebAction)[keyof typeof WebAction]
export interface ActionRequest { action: WebAction; session: string; target?: string; name?: string; harness?: string; command?: string; cwd?: string; horizontal?: boolean }
export const ACTION_SCHEMA = api.components.schemas.ActionRequest
export const SOURCE_WRITE_SCHEMA = api.components.schemas.SourceWrite
export const INPUT_SCHEMA = api.paths["/api/input"].post.requestBody.content["application/json"].schema
export function serializeState(value: unknown): string { return JSON.stringify(value).replaceAll("<", "\\u003c") }

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
export function isTerminalEvent(value: unknown): value is TerminalEvent {
  if (!record(value)) return false
  if (value["type"] === "error") return typeof value["message"] === "string"
  if (typeof value["pane"] !== "string" || !/^%\d+$/.test(value["pane"])) return false
  if (value["type"] === "output") return typeof value["text"] === "string" && typeof value["epoch"] === "number"
  const frame = value["frame"]
  return value["type"] === "snapshot" && record(frame) && typeof frame["text"] === "string" && typeof frame["epoch"] === "number" && Number.isInteger(frame["cols"]) && Number.isInteger(frame["rows"]) && Number(frame["cols"]) > 0 && Number(frame["rows"]) > 0
}

export function responseError(value: unknown, fallback: string): string {
  return record(value) && typeof value["error"] === "string" ? value["error"] : fallback
}

export function isWebState(value: unknown): value is WebState {
  if (!record(value) || typeof value["token"] !== "string" || !Number.isInteger(value["revision"])) return false
  const list = (key: string, definition: string) => Array.isArray(value[key]) && value[key].every((item: unknown) => validRecord(definition, item))
  const source = (item: unknown, definition: string) => record(item) && typeof item["source"] === "string" && typeof item["etag"] === "string" && validRecord(definition, item["value"])
  const map = (item: unknown, definition: string) => record(item) && Object.values(item).every(entry => validRecord(definition, entry))
  if (!list("sessions", "TreeSession") || !list("findings", "DoctorFinding") || !Array.isArray(value["boards"]) || !value["boards"].every((item: unknown) => record(item) && validRecord("Name", item["name"]))) return false
  if (!Array.isArray(value["harnesses"]) || !value["harnesses"].every((item: unknown) => typeof item === "string")) return false
  if (!source(value["settings"], "SettingsFile") || !record(value["layouts"]) || !Object.values(value["layouts"]).every(item => source(item, "LayoutFile"))) return false
  if (!record(value["geometry"]) || !Object.values(value["geometry"]).every(item => typeof item === "string")) return false
  const page = value["page"]
  if (!record(page) || !["offset", "limit", "total"].every(key => Number.isSafeInteger(page[key]) && Number(page[key]) >= 0)) return false
  const board = value["board"]
  if (board === null) return true
  if (!record(board) || !validRecord("Name", board["name"]) || !Array.isArray(board["messages"]) || !board["messages"].every((item: unknown) => validRecord("BoardMessage", item)) || !Array.isArray(board["receipts"]) || !board["receipts"].every((item: unknown) => validRecord("MessageReceipt", item))) return false
  return map(board["threads"], "ThreadIndex") && map(board["presences"], "Presence") && map(board["streaks"], "WaitStreak") && map(board["notifications"], "NotificationMarker") && map(board["counters"], "UnreadCounter") && map(board["sequenceCounters"], "SequenceCounter") && map(board["summaries"], "InboxSummary") && (board["ledger"] === undefined || validRecord("SchemaLedger", board["ledger"]))
}

const validRecord = (name: string, value: unknown): boolean => {
  try { return validateContract(name as Parameters<typeof validateContract>[0], value).length === 0 } catch { return false }
}
