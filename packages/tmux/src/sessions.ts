import type { TmuxRunner } from "./runner.ts"

export interface CreateSessionInput {
  name: string
  /** Name of the first window; tmux's default when absent. */
  windowName?: string
  cwd?: string
  command?: string
  /** Initial size for a detached session; clients resize it on attach. */
  width?: number
  height?: number
}

/** Session lifecycle. Sessions are created detached; attaching is the human's move. */
export class Sessions {
  private readonly run: TmuxRunner

  constructor(run: TmuxRunner) {
    this.run = run
  }

  async create(input: CreateSessionInput): Promise<{ sessionId: string; windowId: string; paneId: string }> {
    const args = ["new-session", "-d", "-s", input.name, "-P", "-F", "#{session_id}\t#{window_id}\t#{pane_id}"]
    if (input.windowName !== undefined) args.push("-n", input.windowName)
    if (input.cwd !== undefined) args.push("-c", input.cwd)
    if (input.width !== undefined) args.push("-x", String(input.width))
    if (input.height !== undefined) args.push("-y", String(input.height))
    if (input.command !== undefined) args.push(input.command)
    const [sessionId, windowId, paneId] = (await this.run(args)).trim().split("\t")
    if (!sessionId || !windowId || !paneId) throw new Error(`tmux new-session returned no ids for ${input.name}`)
    return { sessionId, windowId, paneId }
  }

  async kill(name: string): Promise<void> {
    await this.run(["kill-session", "-t", name])
  }
}
