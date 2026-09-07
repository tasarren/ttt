import { NORMALIZE_HOOK, PROFILES } from "@ttt/tmux"
import type { SetupReport } from "@ttt/tmux"
import { assertName } from "@ttt/board"

import { parseCommandArgs } from "../../args.ts"
import { CliError, usageError } from "../../cli-error.ts"
import { readLayout } from "../../layout.ts"
import { writeSessionRecord } from "../../session-record.ts"
import type { TmuxVerb, TmuxVerbContext } from "../../tmux-context.ts"
import { buildLayout } from "./build.ts"
import type { BuildReport } from "./build.ts"

const SETUP_OPTIONS = {
  name: { type: "string" },
  layout: { type: "string" },
  profile: { type: "string" },
  cwd: { type: "string" },
  "non-interactive": { type: "boolean", default: false },
} as const

/**
 * `ttt tmux setup --name S [--layout L]`: creates a detached session and normalizes it, then
 * builds the layout's windows inside it. Any failure after `new-session` kills the half-built
 * session: a session the user did not have before must not survive half-normalized.
 */
export const setup: TmuxVerb = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, SETUP_OPTIONS)
  if (positionals.length > 0) throw usageError("usage: ttt tmux setup --name SESSION [--layout NAME] [--profile NAME] [--cwd DIR]")
  const name = values.name
  if (name === undefined) throw usageError("setup needs --name SESSION (the interactive wizard arrives with layouts)")
  await createSession(ctx, { name, ...(values.layout !== undefined ? { layout: values.layout } : {}), ...(values.profile !== undefined ? { profile: values.profile } : {}), ...(values.cwd !== undefined ? { cwd: values.cwd } : {}) })
}

export interface CreateSessionInput {
  name: string
  layout?: string
  profile?: string
  cwd?: string
}

/** The one session-creation flow, shared by `setup` and `restore`. Validates everything before touching tmux. */
export async function createSession(ctx: TmuxVerbContext, input: CreateSessionInput): Promise<void> {
  try {
    assertName(input.name, "session name")
  } catch(error) {
    throw usageError(error instanceof Error ? error.message : String(error))
  }
  const layout = input.layout !== undefined ? await readLayout(ctx.settings.home, input.layout) : undefined
  const profileName = input.profile ?? layout?.profile ?? "agents"
  const profile = PROFILES[profileName]
  if (!profile) throw usageError(`unknown profile ${JSON.stringify(profileName)}; available: ${Object.keys(PROFILES).join(", ")}`)
  if (await ctx.tmux.inventory.hasSession(input.name)) throw new CliError(`tmux session already exists: ${input.name}`)

  const cwd = input.cwd ?? layout?.cwd
  // With a layout, the first window is the layout's first window; without one, tmux's default shell.
  const firstWindow = layout?.windows[0]?.name
  await ctx.tmux.sessions.create({ name: input.name, ...(cwd !== undefined ? { cwd } : {}), ...(firstWindow !== undefined ? { windowName: PLACEHOLDER_WINDOW } : {}) })
  let report: SetupReport
  let built: BuildReport | undefined
  try {
    report = await ctx.tmux.setup.apply(input.name, profile, hookCommand(ctx))
    if (layout) {
      built = await buildLayout(ctx.tmux, input.name, layout, cwd)
      // The placeholder only existed so the session could be created before its real windows.
      const placeholder = await ctx.tmux.windows.find(input.name, PLACEHOLDER_WINDOW)
      if (placeholder) await ctx.tmux.windows.close(placeholder.id)
    }
    await writeSessionRecord(ctx.settings.home, {
      version: 1,
      session: input.name,
      profile: profile.name,
      hookBin: ctx.binPath,
      ...(input.layout !== undefined ? { layout: input.layout } : {}),
      createdAt: new Date().toISOString(),
    })
  } catch(error) {
    await ctx.tmux.sessions.kill(input.name).catch(() => undefined)
    throw new CliError(`setup of ${input.name} failed and the session was removed: ${error instanceof Error ? error.message : String(error)}`)
  }
  process.stdout.write(formatReport(report))
  if (built) process.stdout.write(`layout ${input.layout}: ${built.created.length} window${built.created.length === 1 ? "" : "s"} created${built.skipped.length > 0 ? `, skipped ${built.skipped.join(", ")}` : ""}.\n`)
  process.stdout.write(`attach with: tmux attach -t ${input.name}\n`)
}

/** A session cannot exist without a window; this one is closed once the layout's windows are up. */
const PLACEHOLDER_WINDOW = "ttt-setup"

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
