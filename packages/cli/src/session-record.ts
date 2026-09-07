import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { assertName, isErrno } from "@ttt/board"

import { CliError } from "./cli-error.ts"

/** What `ttt tmux setup` wrote for a session; read back by `doctor` and as `save` defaults. */
export interface SessionRecord {
  version: 1
  session: string
  profile: string
  /** Absolute path to the ttt executable the normalize hook calls; `doctor` verifies it exists. */
  hookBin: string
  /** Layout the session was created from, when any. */
  layout?: string
  createdAt: string
}

export function sessionRecordPath(home: string, session: string): string {
  return join(home, "sessions", session, "session.json")
}

export async function writeSessionRecord(home: string, record: SessionRecord): Promise<void> {
  assertName(record.session, "session name")
  const path = sessionRecordPath(home, record.session)
  await mkdir(join(home, "sessions", record.session), { recursive: true })
  const temporary = `${path}.tmp.${process.pid}`
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8")
  await rename(temporary, path)
}

/** The record, or undefined when the session was never set up by ttt. A malformed file is an exit-2 error. */
export async function readSessionRecord(home: string, session: string): Promise<SessionRecord | undefined> {
  const path = sessionRecordPath(home, session)
  let text: string
  try {
    text = await readFile(path, "utf8")
  } catch(error) {
    if (isErrno(error, "ENOENT")) return undefined
    throw error
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch(error) {
    throw new CliError(`${path}: ${error instanceof Error ? error.message : String(error)}`, 2)
  }
  return parseSessionRecord(raw, path)
}

function parseSessionRecord(raw: unknown, path: string): SessionRecord {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new CliError(`${path}: must be an object`, 2)
  const record = raw as Record<string, unknown>
  if (record["version"] !== 1) throw new CliError(`${path}: version must be 1`, 2)
  const text = (key: string): string => {
    const value = record[key]
    if (typeof value !== "string" || value === "") throw new CliError(`${path}: ${key} must be a non-empty string`, 2)
    return value
  }
  const layout = record["layout"]
  if (layout !== undefined && (typeof layout !== "string" || layout === "")) throw new CliError(`${path}: layout must be a non-empty string`, 2)
  return {
    version: 1,
    session: text("session"),
    profile: text("profile"),
    hookBin: text("hookBin"),
    ...(typeof layout === "string" ? { layout } : {}),
    createdAt: text("createdAt"),
  }
}
