import { readdir } from "node:fs/promises"
import { join } from "node:path"

import { assertName, isErrno } from "@ttt/board"

import { usageError } from "../../cli-error.ts"

/** Long enough for `REVIEWER-12`, short enough that a bar of eight windows still reads. */
export const MAX_WINDOW_NAME = 12

export function checkWindowName(name: string): void {
  try {
    assertName(name, "window name")
  } catch(error) {
    throw usageError(error instanceof Error ? error.message : String(error))
  }
  if (name.length > MAX_WINDOW_NAME) throw usageError(`window name ${JSON.stringify(name)} is longer than ${MAX_WINDOW_NAME} characters; it must fit the status bar`)
}

/**
 * `HARNESS-N` with the lowest free N. "Free" means no live window has the name and no mailbox
 * directory exists for it: a reused name would silently inherit an old inbox.
 */
export function generateWindowName(harness: string | undefined, taken: ReadonlySet<string>): string {
  const stem = (harness ?? "agent").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, MAX_WINDOW_NAME - 3) || "AGENT"
  for (let n = 1; ; n += 1) {
    const candidate = `${stem}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

/** Mailbox names on disk for a session; absent board means none. */
export async function mailboxNames(boardRoot: string, session: string): Promise<string[]> {
  try {
    const entries = await readdir(join(boardRoot, session, "mailboxes"), { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch(error) {
    if (isErrno(error, "ENOENT")) return []
    throw error
  }
}
