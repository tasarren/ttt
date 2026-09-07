import type { TmuxRunner } from "./runner.ts"

export interface SessionHook {
  name: string
  command: string
}

const HOOK_LINE = /^(?<name>[a-z-]+)\[(?<index>\d+)\] (?<command>.*)$/

/** Session-scoped hooks only; global hooks belong to the user's config. */
export class Hooks {
  private readonly run: TmuxRunner

  constructor(run: TmuxRunner) {
    this.run = run
  }

  async set(session: string, name: string, command: string): Promise<void> {
    await this.run(["set-hook", "-t", session, name, command])
  }

  async unset(session: string, name: string): Promise<void> {
    await this.run(["set-hook", "-u", "-t", session, name])
  }

  /** Hooks explicitly set on the session; `show-hooks` prints `name[index] command` per line. */
  async list(session: string): Promise<SessionHook[]> {
    const stdout = await this.run(["show-hooks", "-t", session])
    const hooks: SessionHook[] = []
    for (const line of stdout.split("\n")) {
      const match = HOOK_LINE.exec(line)
      if (match?.groups) hooks.push({ name: match.groups["name"]!, command: match.groups["command"]! })
    }
    return hooks
  }
}
