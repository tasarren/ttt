import { setTimeout as sleep } from "node:timers/promises"

import { TmuxError, TmuxFailure } from "./runner.ts"
import type { TmuxRunner } from "./runner.ts"

export interface WaitForInput {
  target: string
  pattern: RegExp
  timeoutMs: number
  /** How often the screen is re-read; default 500 ms. */
  pollMs?: number
  /** How many lines of history each poll reads; default 200. */
  lines?: number
  signal?: AbortSignal
}

export const WaitOutcome = {
  Matched: "matched",
  TimedOut: "timed_out",
  Aborted: "aborted",
} as const
export type WaitOutcome = (typeof WaitOutcome)[keyof typeof WaitOutcome]

export interface WaitForResult {
  outcome: WaitOutcome
  /** The matching line when `outcome` is `matched`. */
  line?: string
}

export interface PopupInput {
  session: string
  command: string
  title?: string
  /** Columns or a percentage string (`80%`). */
  width?: string
  height?: string
  cwd?: string
}

/** Reading and waiting on what a pane shows, plus client-facing notices. */
export class Screen {
  private readonly run: TmuxRunner

  constructor(run: TmuxRunner) {
    this.run = run
  }

  /** Last `lines` lines of the resolved target (a pane id, else a window id
   * which tmux reads as its active pane). `joinWrapped` re-joins lines tmux
   * wrapped at the pane width. */
  async capture(target: string, lines: number, joinWrapped: boolean): Promise<string> {
    const args = ["capture-pane", "-p", "-t", target, "-S", `-${lines}`]
    if (joinWrapped) args.push("-J")
    return this.run(args)
  }

  /** Polls the screen until a line matches; bounded by `timeoutMs` and the optional signal. */
  async waitFor(input: WaitForInput): Promise<WaitForResult> {
    const pollMs = input.pollMs ?? 500
    const lines = input.lines ?? 200
    const deadline = Date.now() + input.timeoutMs
    for (;;) {
      if (input.signal?.aborted) return { outcome: WaitOutcome.Aborted }
      const text = await this.capture(input.target, lines, true)
      const line = text.split("\n").find((candidate) => input.pattern.test(candidate))
      if (line !== undefined) return { outcome: WaitOutcome.Matched, line }
      if (Date.now() >= deadline) return { outcome: WaitOutcome.TimedOut }
      await sleep(Math.min(pollMs, Math.max(0, deadline - Date.now())), undefined, { signal: input.signal }).catch(() => undefined)
    }
  }

  /** A floating window running `command`; needs an attached client (`no_client` otherwise). */
  async popup(input: PopupInput): Promise<void> {
    const [client] = await this.clients(input.session)
    if (client === undefined) {
      throw new TmuxError(TmuxFailure.NoClient, "display-popup", `no client attached to session ${input.session}`)
    }
    const args = ["display-popup", "-E", "-c", client]
    if (input.title !== undefined) args.push("-T", input.title)
    if (input.width !== undefined) args.push("-w", input.width)
    if (input.height !== undefined) args.push("-h", input.height)
    if (input.cwd !== undefined) args.push("-d", input.cwd)
    await this.run([...args, input.command])
  }

  /** One-line notice on the session's status line; silently a no-op without a client. */
  async flash(session: string, text: string): Promise<void> {
    await this.run(["display-message", "-t", session, text])
  }

  /** Redraws the status line of every client on the session now instead of at the next `status-interval`. */
  async refreshStatus(session: string): Promise<void> {
    for (const client of await this.clients(session)) {
      await this.run(["refresh-client", "-S", "-t", client])
    }
  }

  /** `refresh-client` and `display-popup` address clients, not sessions; a detached session has none. */
  private async clients(session: string): Promise<string[]> {
    const stdout = await this.run(["list-clients", "-t", session, "-F", "#{client_name}"])
    return stdout.split("\n").filter((line) => line !== "")
  }
}
