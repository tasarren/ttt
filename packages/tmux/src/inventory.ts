import { UserOption } from "./options.ts"
import type { TmuxRunner } from "./runner.ts"

export interface TmuxSession {
  id: string
  name: string
  attached: boolean
}

export interface TmuxWindow {
  name: string
  id: string
}

/** One live pane: identity plus the process id the pane started from. */
export interface LivePane {
  session: string
  window: string
  windowId: string
  pane: string
  /** Positional index within the window; the lowest is the original pane. */
  index: number
  pid: number
  /** `@ttt_agent`: the window name of the agent that owns this pane, when stamped. */
  agent: string | undefined
}

/** A pane as `tree` shows it: `LivePane` plus what a human or agent wants to see at a glance. */
export interface TreePane extends LivePane {
  active: boolean
  dead: boolean
  cwd: string
  /** `#{pane_current_command}`: the foreground process name, never its arguments. */
  command: string
  title: string
  /** `@ttt_harness`, when ttt started the pane. */
  harness: string | undefined
  /** `@ttt_command`: the command line ttt started the pane with; never `pane_start_command`. */
  startCommand: string | undefined
}

export interface TreeWindow extends TmuxWindow {
  index: number
  active: boolean
  panes: TreePane[]
}

export interface TreeSession extends TmuxSession {
  windows: TreeWindow[]
}

const PANE_FORMAT = `#{session_name}\t#{window_name}\t#{window_id}\t#{pane_id}\t#{pane_index}\t#{pane_pid}\t#{${UserOption.Agent}}`
const TREE_PANE_FORMAT = `${PANE_FORMAT}\t#{pane_active}\t#{pane_dead}\t#{pane_current_path}\t#{pane_current_command}\t#{pane_title}\t#{${UserOption.Harness}}\t#{${UserOption.Command}}`
const PANE_FIELDS = 7

/** Lists sessions, windows, and panes as typed rows; malformed lines are skipped, never thrown. */
export class Inventory {
  private readonly run: TmuxRunner

  constructor(run: TmuxRunner) {
    this.run = run
  }

  async listSessions(): Promise<TmuxSession[]> {
    const stdout = await this.run(["list-sessions", "-F", "#{session_id}\t#{session_name}\t#{session_attached}"])
    const sessions: TmuxSession[] = []
    for (const line of stdout.split("\n")) {
      const [id, name, attached] = line.split("\t")
      if (!id || !name || attached === undefined) continue
      sessions.push({ id, name, attached: attached !== "0" })
    }
    return sessions
  }

  async hasSession(name: string): Promise<boolean> {
    return (await this.listSessions()).some((session) => session.name === name)
  }

  async listWindows(session: string): Promise<TmuxWindow[]> {
    const stdout = await this.run(["list-windows", "-t", session, "-F", "#{window_name}\t#{window_id}"])
    return stdout
      .split("\n")
      .map((line) => line.split("\t"))
      .filter((parts): parts is [string, string] => parts.length === 2 && parts[0] !== "" && parts[1] !== "")
      .map(([name, id]) => ({ name, id }))
  }

  /** Every live pane on this server, with the process id each pane started from. */
  async listAllPanes(): Promise<LivePane[]> {
    const stdout = await this.run(["list-panes", "-a", "-F", PANE_FORMAT])
    const panes: LivePane[] = []
    for (const line of stdout.split("\n")) {
      const pane = parseLivePane(line.split("\t"))
      if (pane) panes.push(pane)
    }
    return panes
  }

  /** Session > Window > Pane for one session, in tmux order. */
  async tree(session: string): Promise<TreeSession> {
    const found = (await this.listSessions()).find((candidate) => candidate.name === session)
    if (!found) throw new Error(`tmux session does not exist: ${session}`)
    const windowRows = await this.run(["list-windows", "-t", session, "-F", "#{window_name}\t#{window_id}\t#{window_index}\t#{window_active}"])
    const paneRows = await this.run(["list-panes", "-s", "-t", session, "-F", TREE_PANE_FORMAT])
    const panesByWindow = new Map<string, TreePane[]>()
    for (const line of paneRows.split("\n")) {
      const pane = parseTreePane(line.split("\t"))
      if (!pane) continue
      const list = panesByWindow.get(pane.windowId) ?? []
      list.push(pane)
      panesByWindow.set(pane.windowId, list)
    }
    const windows: TreeWindow[] = []
    for (const line of windowRows.split("\n")) {
      const [name, id, rawIndex, active] = line.split("\t")
      const index = Number(rawIndex)
      if (!name || !id || !Number.isInteger(index)) continue
      const panes = (panesByWindow.get(id) ?? []).sort((a, b) => a.index - b.index)
      windows.push({ name, id, index, active: active === "1", panes })
    }
    return { ...found, windows }
  }
}

function parseLivePane(parts: string[]): LivePane | undefined {
  const [session, window, windowId, pane, rawIndex, rawPid, agent] = parts
  const pid = Number(rawPid)
  const index = Number(rawIndex)
  if (!session || !window || !windowId || !pane || !Number.isInteger(pid) || !Number.isInteger(index)) return undefined
  return { session, window, windowId, pane, index, pid, agent: agent || undefined }
}

function parseTreePane(parts: string[]): TreePane | undefined {
  const live = parseLivePane(parts)
  if (!live) return undefined
  const [active, dead, cwd, command, title, harness, startCommand] = parts.slice(PANE_FIELDS)
  return {
    ...live,
    active: active === "1",
    dead: dead === "1",
    cwd: cwd ?? "",
    command: command ?? "",
    title: title ?? "",
    harness: harness || undefined,
    startCommand: startCommand || undefined,
  }
}
