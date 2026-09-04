import { CURRENT_SCHEMA_VERSION, MIGRATION_STEPS, PRE_LEDGER_VERSION, boardFor } from "./manifest.ts"
import type { SessionBoards } from "./manifest.ts"

export { CURRENT_SCHEMA_VERSION, MIGRATION_STEPS, PRE_LEDGER_VERSION }
export type { MigrationStep, SessionBoards } from "./manifest.ts"

export interface MigrateOptions {
  dryRun: boolean
}

export interface MigrateResult {
  sessionRoot: string
  from: number
  to: number
  threads: number
  mailboxes: number
  dryRun: boolean
}

/**
 * Runs pending migration steps for one session board. Steps are idempotent, so reruns are safe.
 * Refuses boards newer than this code instead of guessing. Never touches unread/read history.
 */
export async function migrateSession(boards: SessionBoards, options: MigrateOptions): Promise<MigrateResult> {
  const board = boardFor(boards)
  const from = (await board.schemaVersion()) ?? PRE_LEDGER_VERSION
  if (from > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `board at ${boards.sessionRoot} is schema v${from}, newer than this ttt (v${CURRENT_SCHEMA_VERSION}); upgrade ttt`,
    )
  }
  let threads = 0
  let mailboxes = 0
  let to = from
  for (const step of MIGRATION_STEPS) {
    if (step.from !== to || step.to > CURRENT_SCHEMA_VERSION) continue
    const counted = await step.migrate(board, { dryRun: options.dryRun })
    threads += counted.threads ?? 0
    mailboxes += counted.mailboxes ?? 0
    to = step.to
  }
  if (!options.dryRun && to !== from) await board.setSchemaVersion(to)
  return { sessionRoot: boards.sessionRoot, from, to, threads, mailboxes, dryRun: options.dryRun }
}
