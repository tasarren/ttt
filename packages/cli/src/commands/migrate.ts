import { readdir } from "node:fs/promises"
import { join } from "node:path"

import { migrateSession } from "@ttt/migrations"

import { parseCommandArgs } from "../args.ts"
import { CliError, usageError } from "../cli-error.ts"
import type { Handler } from "../context.ts"

const MIGRATE_OPTIONS = {
  "dry-run": { type: "boolean", default: false },
  all: { type: "boolean", default: false },
} as const

/** `migrate [--dry-run] [--all]`: runs pending schema migrations for this session (or every session). */
export const migrate: Handler = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, MIGRATE_OPTIONS)
  if (positionals.length > 0) throw usageError("usage: ttt migrate [--dry-run] [--all]")
  const sessions = values.all ? await sessionNames(ctx.settings.boardRoot) : [ctx.session]
  if (sessions.length === 0) throw new CliError(`no boards under ${ctx.settings.boardRoot}`)
  let failures = 0
  for (const session of sessions) {
    try {
      const result = await migrateSession(
        { sessionRoot: join(ctx.settings.boardRoot, session), lock: ctx.settings.lock },
        { dryRun: values["dry-run"] },
      )
      const dry = result.dryRun ? " (dry-run)" : ""
      const moved = result.to === result.from
        ? `already v${result.from}`
        : `v${result.from} -> v${result.to}`
      const units = [
        `${result.threads} thread${result.threads === 1 ? "" : "s"}`,
        `${result.mailboxes} mailbox${result.mailboxes === 1 ? "" : "es"}`,
      ].join(", ")
      process.stdout.write(`ttt: session ${session}: ${moved}, ${units} indexed${dry}.\n`)
    } catch(error) {
      failures += 1
      process.stderr.write(`ttt: session ${session} failed: ${error instanceof Error ? error.message : String(error)}\n`)
    }
  }
  if (failures > 0) throw new CliError(`migrate failed for ${failures} session${failures === 1 ? "" : "s"}`)
}

async function sessionNames(boardRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(boardRoot, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  } catch(error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return []
    throw error
  }
}
