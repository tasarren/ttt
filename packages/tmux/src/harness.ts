/**
 * What `ttt tmux open --harness H` knows about a harness: how to start it and which screen line
 * means it accepts input. Only entries observed on a real start ship here; each carries the
 * version and date it was verified against, on tmux 3.7c at 160x40.
 */
export interface HarnessPreset {
  command: string
  /** Matches one screen line once the harness accepts input. */
  ready: RegExp
  /** Something an operator should know before trusting `ready` blindly. */
  note?: string
}

export const Harness = {
  Claude: "claude",
  OpenCode: "opencode",
  Codex: "codex",
  Shell: "sh",
} as const
export type Harness = (typeof Harness)[keyof typeof Harness]

export const HARNESS_PRESETS: Readonly<Record<Harness, HarnessPreset>> = {
  // verified on Claude Code 2.1.260, 2026-09-07: the mode line under the input box.
  [Harness.Claude]: { command: "claude", ready: /auto mode on|plan mode on|accept edits on|bypass permissions on/ },
  // verified on opencode v0.0.0-beta-17823, 2026-09-07: the input placeholder.
  [Harness.OpenCode]: { command: "opencode", ready: /Ask anything\.\.\./ },
  // verified on codex-cli 0.153.4, 2026-09-07: the input placeholder, shown after the trust prompt.
  [Harness.Codex]: {
    command: "codex",
    ready: /Ask Codex to do anything/,
    note: "a directory Codex has not seen asks 'Do you trust the contents' first; answer with `ttt tmux press NAME Enter` or start it in a trusted --cwd",
  },
  // A POSIX shell prompt (`$`, `sh-5.3$`, `#`), used by ttt's own tests. Verified with bash-as-sh 5.3.
  [Harness.Shell]: { command: "sh", ready: /^[^ ]*[$#] *$/ },
}

export function harnessPreset(name: string): HarnessPreset | undefined {
  return Object.hasOwn(HARNESS_PRESETS, name) ? HARNESS_PRESETS[name as Harness] : undefined
}
