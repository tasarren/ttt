import { spawn } from "node:child_process"
import type { ChildProcessWithoutNullStreams } from "node:child_process"
import type { TmuxServer } from "./runner.ts"

/** Decode control-mode octal escaping without losing UTF-8 bytes. */
export function controlBytes(text: string): Buffer {
  const pieces: Buffer[] = []
  let start = 0
  for (const match of text.matchAll(/\\([0-7]{3})/g)) {
    pieces.push(Buffer.from(text.slice(start, match.index)), Buffer.from([Number.parseInt(match[1]!, 8)]))
    start = match.index + match[0].length
  }
  pieces.push(Buffer.from(text.slice(start)))
  return Buffer.concat(pieces)
}

/** One control-mode observer. Pane output stays off until explicitly subscribed. */
export class ControlClient {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly ready: Promise<void>
  private chain: Promise<unknown> = Promise.resolve()
  private pending: { resolve: (value: string) => void; reject: (error: Error) => void; lines: string[]; guard: string; completed?: (value: string) => void } | undefined
  private output: (pane: string, bytes: Buffer) => void = () => {}
  private changed: () => void = () => {}
  private failed: (error: Error) => void = () => {}
  private closed = false

  constructor(session: string, server: TmuxServer = {}) {
    const socket = server.socketPath ? ["-S", server.socketPath] : server.socket ? ["-L", server.socket] : []
    this.child = spawn("tmux", [...socket, "-C", "attach-session", "-t", session, "-f", "no-output,ignore-size,active-pane"], { stdio: "pipe" })
    let initialized = false
    let buffer = ""
    let stderr = ""
    this.ready = new Promise<void>((resolve, reject) => {
      this.child.stdout.setEncoding("utf8")
      this.child.stderr.setEncoding("utf8")
      this.child.stderr.on("data", (text: string) => { stderr += text })
      this.child.stdout.on("data", (text: string) => {
        buffer += text
        let newline: number
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline).replace(/\r$/, "")
          buffer = buffer.slice(newline + 1)
          const marker = /^%(begin|end|error) ([0-9]+) ([0-9]+) [0-9]+$/.exec(line)
          if (!initialized && marker?.[1] === "end") { initialized = true; resolve(); continue }
          if (!initialized && marker?.[1] === "error") { reject(new Error(stderr || "tmux control attach failed")); continue }
          const pending = this.pending
          if (pending?.guard) {
            if (marker && marker[1] !== "begin" && pending.guard === `${marker[2]}:${marker[3]}`) {
              this.pending = undefined
              const value = pending.lines.join("\n")
              if (marker[1] === "error") pending.reject(new Error(value || "tmux command failed"))
              else { pending.completed?.(value); pending.resolve(value) }
            } else pending.lines.push(line)
            continue
          }
          if (marker?.[1] === "begin" && pending) { pending.guard = `${marker[2]}:${marker[3]}`; continue }
          const output = /^%output (%\d+) (.*)$/.exec(line)
          if (output) this.output(output[1]!, controlBytes(output[2]!))
          else if (/^%(?:window|session|layout|pane-mode)/.test(line)) this.changed()
        }
      })
      const fail = (error: Error) => {
        reject(error)
        this.pending?.reject(error)
        this.pending = undefined
        if (!this.closed) this.failed(error)
      }
      this.child.on("error", fail)
      this.child.on("exit", () => { fail(new Error(stderr || "tmux control connection closed")) })
    })
  }

  onOutput(listener: (pane: string, bytes: Buffer) => void): void { this.output = listener }
  onChange(listener: () => void): void { this.changed = listener }
  onError(listener: (error: Error) => void): void { this.failed = listener }

  command(args: readonly string[], completed?: (value: string) => void): Promise<string> {
    const result = this.chain.then(async() => {
      await this.ready
      if (this.closed) throw new Error("tmux control connection closed")
      return new Promise<string>((resolve, reject) => {
        this.pending = { resolve, reject, lines: [], guard: "", ...(completed ? { completed } : {}) }
        this.child.stdin.write(`${args.map(arg => `'${arg.replaceAll("'", "'\\''")}'`).join(" ")}\n`)
      })
    })
    this.chain = result.catch(() => {})
    return result
  }

  async show(panes: readonly string[]): Promise<void> {
    const all = (await this.command(["list-panes", "-a", "-F", "#{pane_id}"])).split("\n").filter(Boolean)
    // Clearing no-output resets pane flags; snapshot gating suppresses output until flags are set.
    await this.command(["refresh-client", "-f", "!no-output"])
    for (const pane of all) await this.command(["refresh-client", "-A", `${pane}:off`])
    for (const pane of panes) await this.command(["refresh-client", "-A", `${pane}:on`])
  }

  close(): void {
    this.closed = true
    this.pending?.reject(new Error("tmux control connection closed"))
    this.pending = undefined
    this.child.kill()
  }
}
