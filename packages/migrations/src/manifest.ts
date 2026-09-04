import { Board } from "@ttt/board"
import type { LockOptions } from "@ttt/board"

import { rebuildThreadIndex } from "./steps/rebuild-thread-index.ts"

/** One schema jump: idempotent, rerunnable, operating on a single session root. */
export interface MigrationStep {
  from: number
  to: number
  /** Short human name shown by `ttt migrate`. */
  name: string
  /** Counts first (`dryRun`), writes only when false. Returns threads indexed (or to index). */
  migrate: (board: Board, options: { dryRun: boolean }) => Promise<{ threads: number }>
}

/** Ordered schema history. New versions append exactly one step. */
export const MIGRATION_STEPS: MigrationStep[] = [rebuildThreadIndex]

/** Schema version written by fresh code; the ledger starts here when no migration ever ran. */
export const CURRENT_SCHEMA_VERSION = 5

/** Ledger version when no `state/schema.json` exists yet (last version before ledgers). */
export const PRE_LEDGER_VERSION = 4

export interface SessionBoards {
  sessionRoot: string
  lock: LockOptions
}

export function boardFor(boards: SessionBoards): Board {
  return new Board({ sessionRoot: boards.sessionRoot, notifySeconds: 0, lock: boards.lock })
}
