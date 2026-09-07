import { NORMALIZE_HOOK, PROFILES } from "@ttt/tmux"
import type { SetupReport } from "@ttt/tmux"
import { assertName } from "@ttt/board"

import { parseCommandArgs } from "../../args.ts"
import { CliError, usageError } from "../../cli-error.ts"
import { writeSessionRecord } from "../../session-record.ts"
import type { TmuxVerb, TmuxVerbContext } from "../../tmux-context.ts"

const SETUP_OPTIONS = {
  name: { type: "string" },
  profile: { type: "string" },
  cwd: { type: "string" },
  "non-interactive": { type: "boolean", default: false },
} as const

/**
 * `ttt tmux setup --name S`: creates a detached session and normalizes it. Any failure after
 * `new-session` kills the half-built session: a session the user did not have before must not
 * survive half-normalized.
 */
export const setup: TmuxVerb = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, SETUP_OPTIONS)
  if (positionals.length > 0) throw usageError("usage: ttt tmux setup --name SESSION [--profile NAME] [--cwd DIR]")
  const name = values.name
  if (name === undefined) throw usageError("setup needs --name SESSION (the interactive wizard arrives with layouts)")
  try {
    assertName(name, "session name")
  } catch(error) {
    throw usageError(error instanceof Error ? error.message : String(error))
  }
  const profile = PROFILES[values.profile ?? "agents"]
  if (!profile) throw usageError(`unknown profile ${JSON.stringify(values.profile)}; available: ${Object.keys(PROFILES).join(", ")}`)
  if (await ctx.tmux.inventory.hasSession(name)) throw new CliError(`tmux session already exists: ${name}`)

  await ctx.tmux.sessions.create({ name, ...(values.cwd !== undefined ? { cwd: values.cwd } : {}) })
  let report: SetupReport
  try {
    report = await ctx.tmux.setup.apply(name, profile, hookCommand(ctx))
    await writeSessionRecord(ctx.settings.home, {
      version: 1,
      session: name,
      profile: profile.name,
      hookBin: ctx.binPath,
      createdAt: new Date().toISOString(),
    })
  } catch(error) {
    await ctx.tmux.sessions.kill(name).catch(() => undefined)
    throw new CliError(`setup of ${name} failed and the session was removed: ${error instanceof Error ? error.message : String(error)}`)
  }
  process.stdout.write(formatReport(report))
  process.stdout.write(`attach with: tmux attach -t ${name}\n`)
}

/** The hook uses the absolute path of this executable: tmux's PATH is whatever the server started with. */
export function hookCommand(ctx: TmuxVerbContext): string {
  return `run-shell "${process.execPath} ${ctx.binPath} tmux _normalize-window #{window_id}"`
}

export function formatReport(report: SetupReport): string {
  const pinned = report.checks.filter((check) => check.state === "pinned")
  const off = report.checks.filter((check) => check.state === "off")
  const lines = [`ttt: session ${report.session} set up with profile ${report.profile}: ${pinned.length} option${pinned.length === 1 ? "" : "s"} pinned, hook ${NORMALIZE_HOOK} installed.`]
  for (const check of off) lines.push(`  note: ${check.scope} ${check.key} is ${check.found ?? "unset"}, wanted ${check.wanted}: ${check.why}`)
  return `${lines.join("\n")}\n`
}
