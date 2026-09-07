import { execFile } from "node:child_process"

/** Runs one tmux command and returns its stdout. Injectable so tests never need a tmux server. */
export type TmuxRunner = (args: string[]) => Promise<string>

/** Which tmux server to talk to. Both absent means the default socket (or `$TMUX`). */
export interface TmuxServer {
  /** `tmux -L NAME`: a named socket in tmux's socket directory. */
  socket?: string
  /** `tmux -S PATH`: an explicit socket path. Wins over `socket`. */
  socketPath?: string
  /** Kill a hung command after this long; tmux normally answers in milliseconds. */
  commandTimeoutMs?: number
}

export const DEFAULT_COMMAND_TIMEOUT_MS = 5_000

/** Closed vocabulary of tmux failures we can act on. tmux exits 1 for all of them; stderr tells them apart. */
export const TmuxFailure = {
  NoServer: "no_server",
  NoSession: "no_session",
  NoTarget: "no_target",
  PaneDead: "pane_dead",
  BadOption: "bad_option",
  NoClient: "no_client",
  Timeout: "timeout",
  Unknown: "unknown",
} as const
export type TmuxFailure = (typeof TmuxFailure)[keyof typeof TmuxFailure]

export class TmuxError extends Error {
  readonly code: TmuxFailure
  /** The tmux verb that failed (`list-windows`, `set-option`, ...). */
  readonly verb: string

  constructor(code: TmuxFailure, verb: string, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "TmuxError"
    this.code = code
    this.verb = verb
  }
}

/** Stderr patterns observed on tmux 3.2..3.7; order matters, first hit wins. */
const FAILURE_PATTERNS: ReadonlyArray<readonly [TmuxFailure, RegExp]> = [
  [TmuxFailure.NoServer, /^(?:no server running|error connecting to)/m],
  [TmuxFailure.NoSession, /^can't find session/m],
  [TmuxFailure.PaneDead, /^target pane has exited/m],
  [TmuxFailure.NoTarget, /^(?:no such window|can't find (?:window|pane)|no such pane|can't find target)/m],
  [TmuxFailure.NoClient, /^no current client/m],
  [TmuxFailure.BadOption, /^(?:invalid option|unknown option|empty value|bad value)/m],
]

/** Maps tmux stderr to a `TmuxFailure`; exported so unit tests pin every pattern. */
export function classifyFailure(stderr: string): TmuxFailure {
  const text = stderr.trim()
  for (const [code, pattern] of FAILURE_PATTERNS) {
    if (pattern.test(text)) return code
  }
  return TmuxFailure.Unknown
}

/** A runner bound to one server. Adds `-L`/`-S`, a timeout, and turns exit 1 into a typed `TmuxError`. */
export function createRunner(server: TmuxServer = {}): TmuxRunner {
  const prefix = server.socketPath !== undefined
    ? ["-S", server.socketPath]
    : server.socket !== undefined ? ["-L", server.socket] : []
  const timeout = server.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS
  return (args) => new Promise((resolve, reject) => {
    const verb = args[0] ?? "tmux"
    execFile("tmux", [...prefix, ...args], { timeout, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (!error) {
        resolve(stdout)
        return
      }
      if (error.killed || error.signal === "SIGTERM") {
        reject(new TmuxError(TmuxFailure.Timeout, verb, `tmux ${verb} did not answer within ${timeout}ms`, { cause: error }))
        return
      }
      const detail = stderr.trim() || error.message
      reject(new TmuxError(classifyFailure(stderr), verb, `tmux ${verb}: ${detail}`, { cause: error }))
    })
  })
}

/** The default runner: default socket, default timeout. Kept for callers that never configure a server. */
export const runTmux: TmuxRunner = createRunner()

const VERSION_PATTERN = /(?<major>\d+)\.(?<minor>\d+)/

/** `3.7c` -> `[3, 7]`; `next-3.8` -> `[3, 8]`. Undefined when no `major.minor` is present. */
export function parseVersion(text: string): readonly [number, number] | undefined {
  const match = VERSION_PATTERN.exec(text)
  if (!match?.groups) return undefined
  return [Number(match.groups["major"]), Number(match.groups["minor"])]
}

export function versionAtLeast(found: readonly [number, number], required: readonly [number, number]): boolean {
  return found[0] > required[0] || (found[0] === required[0] && found[1] >= required[1])
}
