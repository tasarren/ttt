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
 * `STEM-N` with the lowest free N. "Free" means no live window or stamp has the name and no
 * mailbox directory exists for it: a reused name would silently inherit an old inbox.
 */
export function generateWindowName(stem: string, taken: ReadonlySet<string>): string {
  return generateName(stem.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, MAX_WINDOW_NAME - 3) || "W", taken, 1)
}

/** `WINDOW-N` for a second agent in WINDOW, counting from 2: the window's own name is seat 1. */
export function generateSeatName(windowName: string, taken: ReadonlySet<string>): string {
  return generateName(windowName, taken, 2)
}

function generateName(cleaned: string, taken: ReadonlySet<string>, first: number): string {
  for (let n = first; ; n += 1) {
    const candidate = `${cleaned}-${n}`
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
