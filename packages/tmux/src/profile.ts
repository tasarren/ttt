import { OptionScope, UserOption } from "./options.ts"

/** What setup does with one option: force it (saving the original), or only report it. */
export const SetupMode = {
  Pin: "pin",
  /** Pin only when the current value is numerically higher; never raise a user's smaller value. */
  PinLowerOnly: "pin-lower-only",
  Assert: "assert",
} as const
export type SetupMode = (typeof SetupMode)[keyof typeof SetupMode]

export interface ProfileOption {
  scope: OptionScope
  key: string
  value: string
  mode: SetupMode
  /** One line shown by `doctor` when the option is off-profile. */
  why: string
}

export interface SetupProfile {
  name: string
  options: readonly ProfileOption[]
}

/**
 * How a pane border names its owner: the stamped agent, a helper's title, or for anything
 * unstamped `pane N · command`, so exactly one pane per window carries the agent's name; then the
 * harness when ttt started one there, the cwd, and a dead marker.
 */
export const PANE_BORDER_FORMAT = `#{?${UserOption.Agent},#{${UserOption.Agent}},#{?${UserOption.Title},#{${UserOption.Title}},pane #{pane_index} · #{pane_current_command}}}#{?${UserOption.Harness}, #{${UserOption.Harness}},} #{s|$HOME|~|:pane_current_path}#{?pane_dead, [dead],}`

/**
 * Window tabs: a trailing `·` when no pane in the window is stamped (furniture: nobody reads a
 * mailbox there; `#{P:...}` joins every pane's stamp, empty means none), then the unread badge
 * from `@ttt_unread` (unset when zero).
 */
export const FURNITURE_MARK = "·"
const TAB = `#I:#W#{?#{P:#{${UserOption.Agent}}},,${FURNITURE_MARK}}#{?${UserOption.Unread},[#{${UserOption.Unread}}],}#{?window_flags,#{window_flags}, }`
export const WINDOW_STATUS_FORMAT = TAB
export const WINDOW_STATUS_CURRENT_FORMAT = `#[bold]${TAB}#[default]`

function session(key: string, value: string, why: string, mode: SetupMode = SetupMode.Pin): ProfileOption {
  return { scope: OptionScope.Session, key, value, mode, why }
}

function window(key: string, value: string, why: string): ProfileOption {
  return { scope: OptionScope.Window, key, value, mode: SetupMode.Pin, why }
}

function server(key: string, value: string, why: string, mode: SetupMode = SetupMode.Pin): ProfileOption {
  return { scope: OptionScope.Server, key, value, mode, why }
}

/**
 * The `agents` profile: identity stays stable, badges are the only signal, panes say who owns
 * them. Session and window scope only, except the two server options every TUI harness wants.
 */
export const AGENTS_PROFILE: SetupProfile = {
  name: "agents",
  options: [
    window("allow-rename", "off", "a program in the pane could rename the window and change the agent's identity"),
    window("automatic-rename", "off", "tmux would rename the window after its foreground command"),
    window("remain-on-exit", "on", "a crashed agent keeps its window and name; `ttt tmux respawn` revives it"),
    window("synchronize-panes", "off", "a paste would land in every pane of the window"),
    window("monitor-activity", "off", "every paste counts as activity; the badge is the signal"),
    window("pane-border-status", "top", "borders show which pane the agent owns"),
    window("pane-border-format", PANE_BORDER_FORMAT, "border text: agent, harness, cwd, dead marker"),
    session("base-index", "1", "window numbers on the bar match prefix+N"),
    session("pane-base-index", "1", "pane numbers match window numbers"),
    session("renumber-windows", "on", "closing a window leaves no gap in the numbering"),
    session("history-limit", "10000", "`ttt capture` can look back this far"),
    session("destroy-unattached", "off", "a session created detached must survive until someone attaches"),
    session("detach-on-destroy", "off", "killing another session must not detach the client"),
    session("visual-activity", "off", "no status-line flashes for activity"),
    session("visual-bell", "off", "no status-line flashes for bells"),
    session("bell-action", "none", "bells from panes are ignored"),
    session("status", "on", "badges need a status line"),
    // Window options on tmux >= 3.0 even though they shape the session's status line.
    window("window-status-format", WINDOW_STATUS_FORMAT, "tabs show the unread badge and mark windows without an agent"),
    window("window-status-current-format", WINDOW_STATUS_CURRENT_FORMAT, "the current tab shows the badge and the mark too"),
    session("aggressive-resize", "on", "captures wrap at the attached client's width, not the smallest client ever seen", SetupMode.Assert),
    server("escape-time", "10", "TUIs in panes see Escape promptly", SetupMode.PinLowerOnly),
    server("focus-events", "on", "TUI harnesses expect focus in/out events"),
  ],
}

export const PROFILES: Readonly<Record<string, SetupProfile>> = { [AGENTS_PROFILE.name]: AGENTS_PROFILE }
