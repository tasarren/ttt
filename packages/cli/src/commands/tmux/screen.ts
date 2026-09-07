import { WaitOutcome } from "@ttt/tmux"

import { boundedInt, parseCommandArgs, splitAtTerminator } from "../../args.ts"
import { CliError, usageError } from "../../cli-error.ts"
import type { TmuxVerb } from "../../tmux-context.ts"
import { requireSession, resolveAgentTarget } from "./target.ts"

const WAIT_OPTIONS = { for: { type: "string" }, timeout: { type: "string" } } as const

/**
 * `ttt tmux wait NAME --for PATTERN [--timeout SECONDS]`: blocks until a line on the agent's
 * screen matches the regular expression. Exit 0 with the line on a match; exit 1 on timeout,
 * so scripts can branch. Bounded by `wait.maxSeconds` like message waits.
 */
export const wait: TmuxVerb = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, WAIT_OPTIONS)
  const [name, ...extra] = positionals
  if (name === undefined || extra.length > 0 || values.for === undefined) throw usageError("usage: ttt tmux wait NAME --for PATTERN [--timeout SECONDS]")
  let pattern: RegExp
  try {
    pattern = new RegExp(values.for)
  } catch(error) {
    throw usageError(`--for is not a valid regular expression: ${error instanceof Error ? error.message : String(error)}`)
  }
  const seconds = boundedInt(values.timeout, "--timeout", ctx.settings.wait.seconds, ctx.settings.wait.maxSeconds)
  const target = await resolveAgentTarget(ctx, name)
  const controller = new AbortController()
  const stop = (): void => {
    controller.abort()
  }
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  try {
    const result = await ctx.tmux.screen.waitFor({ target: target.paneId, pattern, timeoutMs: seconds * 1_000, signal: controller.signal })
    switch (result.outcome) {
      case WaitOutcome.Matched:
        process.stdout.write(`${result.line ?? ""}\n`)
        return
      case WaitOutcome.TimedOut:
        throw new CliError(`${name} did not show /${values.for}/ within ${seconds}s`)
      case WaitOutcome.Aborted:
        throw new CliError("wait interrupted")
    }
  } finally {
    process.off("SIGINT", stop)
    process.off("SIGTERM", stop)
  }
}

const POPUP_OPTIONS = { title: { type: "string" }, width: { type: "string" }, height: { type: "string" }, cwd: { type: "string" } } as const

/** `ttt tmux popup [--title T] [--width W] [--height H] [--cwd DIR] -- COMMAND`: a floating window for the human; needs an attached client. */
export const popup: TmuxVerb = async(argv, ctx) => {
  const { head, body } = splitAtTerminator(argv)
  const { values, positionals } = parseCommandArgs(head, POPUP_OPTIONS)
  if (positionals.length > 0 || body === undefined || body.length === 0) throw usageError("usage: ttt tmux popup [--title TEXT] [--width W] [--height H] [--cwd DIR] -- COMMAND")
  const session = requireSession(ctx)
  await ctx.tmux.screen.popup({
    session,
    command: body.join(" "),
    ...(values.title !== undefined ? { title: values.title } : {}),
    ...(values.width !== undefined ? { width: values.width } : {}),
    ...(values.height !== undefined ? { height: values.height } : {}),
    ...(values.cwd !== undefined ? { cwd: values.cwd } : {}),
  })
}

/** `ttt tmux flash -- TEXT`: one line on the status line; harmless without a client. */
export const flash: TmuxVerb = async(argv, ctx) => {
  const { head, body } = splitAtTerminator(argv)
  const { positionals } = parseCommandArgs(head, {} as const)
  if (positionals.length > 0 || body === undefined || body.length === 0) throw usageError("usage: ttt tmux flash -- TEXT")
  await ctx.tmux.screen.flash(requireSession(ctx), body.join(" "))
}
