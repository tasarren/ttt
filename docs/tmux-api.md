# `@tasarren/tmux` — API reference

A semantic tmux API: every verb parses, validates, or scopes; there is no raw-command passthrough.
Targets are ids (`@n` windows, `%n` panes), never `session:name` strings built by callers; indices
are tmux-relative and never assumed to start at 0. One class per file, composed by the `Tmux` root;
the runner is the only injection point, so tests run against a fake.

## Root

```ts
new Tmux(options: TmuxOptions, run?: TmuxRunner, ancestors?: AncestorResolver)
```

Holds one runner and one option set; the CLI composes exactly one `Tmux` per invocation.

| Member | Type |
|---|---|
| `inventory` | `Inventory` |
| `identity` | `Identity` |
| `windows` | `Windows` |
| `panes` | `Panes` |
| `input` | `Input` |
| `screen` | `Screen` |
| `options` | `Options` |
| `hooks` | `Hooks` |

| Method | Signature | Purpose |
|---|---|---|
| `requireVersion` | `(minimum?: readonly [number, number]) => Promise<void>` | Runs once per instance; throws a `TmuxError` when tmux is older than the minimum (`MIN_TMUX_VERSION` = `[3, 2]`: pane user options and `display-popup`). |

## runner.ts

| Export | Kind | Purpose |
|---|---|---|
| `TmuxRunner` | type | `(args: string[]) => Promise<string>` — runs one tmux command, returns stdout. |
| `TmuxServer` | type | `{ socket?, socketPath?, commandTimeoutMs? }` — `socket` is `tmux -L`, `socketPath` is `tmux -S` and wins; `commandTimeoutMs` kills a hung command (default `DEFAULT_COMMAND_TIMEOUT_MS` = 5000). |
| `createRunner` | function | `(server?: TmuxServer) => TmuxRunner` — binds the socket selection and the timeout; turns exit 1 into a typed `TmuxError`. |
| `runTmux` | constant | The default runner: default socket, default timeout. |
| `TmuxFailure` | vocabulary | `as const`: `no_server`, `no_session`, `no_target`, `pane_dead`, `bad_option`, `no_client`, `timeout`, `unknown`. |
| `TmuxError` | class | `extends Error` with `readonly code: TmuxFailure` and `readonly verb: string` (the tmux verb that failed). |
| `classifyFailure` | function | `(stderr: string) => TmuxFailure` — stderr-pattern dispatch, first match wins; unmapped stderr is `unknown`. |
| `parseVersion` | function | `(text: string) => readonly [number, number] \| undefined` — `3.7c` → `[3, 7]`. |
| `versionAtLeast` | function | `(found, required) => boolean`. |

## context.ts

| Export | Kind | Purpose |
|---|---|---|
| `procAncestors` | function | Walks `/proc` from our PID up; missing entries end the chain, never throw. |
| `AncestorResolver` | type | `() => Promise<number[]>` — injectable so unit tests never read the real process tree. |
| `DetectionSource` | vocabulary | `as const`: `pid-walk`, `pane-env`. |
| `TmuxContext` | type | `{ session, windowName, windowId, paneId, via }`. |
| `Identity` | class | Who we are. Constructor takes `(run, inventory, ancestors = procAncestors)`. |

| Method | Signature | Purpose |
|---|---|---|
| `Identity.detect` | `(paneHint?: string) => Promise<TmuxContext>` | PID ancestry matched against live panes first, then the `$TMUX_PANE` hint, else a hard error naming the `--session`/`--from` flags. Never trusts the tmux active window. |

## inventory.ts

Data:

| Type | Fields |
|---|---|
| `TmuxSession` | `id`, `name`, `attached` |
| `TmuxWindow` | `name`, `id` |
| `LivePane` | `session`, `window`, `windowId`, `pane`, `index`, `pid`, `agent` (`@ttt_agent`, when stamped) |
| `TreePane` | `LivePane` plus `active`, `dead`, `cwd`, `command` (process name only), `title`, `harness` (`@ttt_harness`), `startCommand` (`@ttt_command`; never `pane_start_command`) |
| `TreeWindow` | `TmuxWindow` plus `index`, `active`, `panes` |
| `TreeSession` | `TmuxSession` plus `windows` |

`class Inventory(run)`, all rows typed; malformed lines are skipped, never thrown:

| Method | Signature | Purpose |
|---|---|---|
| `listSessions` | `() => Promise<TmuxSession[]>` | Every session on the server. |
| `hasSession` | `(name: string) => Promise<boolean>` | Membership check. |
| `listWindows` | `(session: string) => Promise<TmuxWindow[]>` | Windows of one session, with ids. |
| `listAllPanes` | `() => Promise<LivePane[]>` | Every live pane on the server (used by identity detection). |
| `tree` | `(session: string) => Promise<TreeSession>` | Session > Window > Pane in tmux order; panes sorted by index. |

## windows.ts

| Export | Kind | Purpose |
|---|---|---|
| `compareWindowIds` | function | `(a, b) => number` — numeric order of `@n`; non-numeric ids fall back to string order. |
| `winnersByName` | function | `(windows: TmuxWindow[]) => Map<string, TmuxWindow>` — lowest id wins per name; duplicate names share one mailbox. |
| `OpenWindowInput` | type | `{ session, name, cwd?, command? }`. |
| `Windows` | class | `(run, inventory)`. Window lifecycle and lookup; names are resolved here and nowhere else. |

| Method | Signature | Purpose |
|---|---|---|
| `find` | `(session, name) => Promise<TmuxWindow \| undefined>` | Duplicate names resolve to the lowest id. |
| `open` | `(input: OpenWindowInput) => Promise<{ windowId, paneId }>` | Creates a detached window; returns its id and first pane id. |
| `close` | `(windowId: string) => Promise<void>` | Kills the window. |

## panes.ts

| Export | Kind | Purpose |
|---|---|---|
| `PaneStamp` | type | `{ agent, harness?, command? }` — what ttt stamps on a pane it starts or identifies; each field maps to one `@ttt_*` option. |
| `resolveAgentPane` | function | `(live: LivePane[], windowId, windowName) => string` — the pane stamped `@ttt_agent` with that window name inside the window, else the lowest-index pane (the agent's original pane, never the active one), else the window id. Pure. |
| `SplitDirection` | vocabulary | `as const`: `vertical` (`-v`), `horizontal` (`-h`). |
| `SplitPaneInput` | type | `{ target, direction, sizePercent?, cwd?, command? }` — `target` is a window or pane id; `sizePercent` is a percentage of the split target. |
| `Panes` | class | `(run, options)`. Every verb takes a pane or window id and returns ids. |

| Method | Signature | Purpose |
|---|---|---|
| `stamp` | `(paneId, live, stamp: PaneStamp) => Promise<void>` | Marks the pane as its window's agent pane and clears `@ttt_agent` from every sibling in the window, so at most one pane per window carries it. Writes only what differs. |
| `split` | `(input: SplitPaneInput) => Promise<string>` | Creates a detached pane; returns its id. |
| `kill` | `(paneId: string) => Promise<void>` | Kills the pane. |
| `respawn` | `(paneId: string, command?: string) => Promise<void>` | Restarts the pane's command; `-k` kills a still-running one first, so the verb is idempotent. |
| `isDead` | `(paneId: string) => Promise<boolean>` | `#{pane_dead}`. `send-keys` to a dead pane succeeds silently, so callers check first. |

## input.ts

`TmuxOptions` (all times in ms, defaults in `DEFAULT_TMUX_OPTIONS`): `inputSettleMs` 800 (after clearing the target's input line), `postPasteMs` 500 (after the paste and between Enters), `enterPresses` 3 (slow TUIs swallow the first ones), `postSendMs` 300.

`Key` vocabulary: `Enter`, `Escape`, `Tab`, `Interrupt` (`C-c`), `ClearLine` (`C-u`), `EndOfFile` (`C-d`).

`class Input(run, options)` — pastes go through a private buffer, so text never touches the user's clipboard:

| Method | Signature | Purpose |
|---|---|---|
| `sendText` | `(target, text) => Promise<void>` | Clears the input line, pastes, presses Enter `enterPresses` times. The messaging path. |
| `type` | `(target, text) => Promise<void>` | Bracketed paste (`-p`), no clearing, no Enter. |
| `press` | `(target, key) => Promise<void>` | `key` is a tmux key name (`Enter`, `C-c`, `M-x`, ...). |
| `interrupt` | `(target) => Promise<void>` | `C-c`. |

## screen.ts

| Export | Kind | Purpose |
|---|---|---|
| `WaitOutcome` | vocabulary | `as const`: `matched`, `timed_out`, `aborted`. |
| `WaitForInput` | type | `{ target, pattern: RegExp, timeoutMs, pollMs? = 500, lines? = 200, signal?: AbortSignal }`. |
| `WaitForResult` | type | `{ outcome, line? }` — `line` present when `matched`. |
| `PopupInput` | type | `{ session, command, title?, width?, height?, cwd? }` — dimensions are columns or a percentage string. |
| `Screen` | class | `(run)`. |

| Method | Signature | Purpose |
|---|---|---|
| `capture` | `(target, lines, joinWrapped) => Promise<string>` | Last `lines` lines; `-J` re-joins lines tmux wrapped at the pane width. A window id reads as its active pane. |
| `waitFor` | `(input: WaitForInput) => Promise<WaitForResult>` | Polls the screen until a line matches; bounded by `timeoutMs` and the optional signal. |
| `popup` | `(input: PopupInput) => Promise<void>` | Floating window on the first attached client; throws `no_client` when the session has none. |
| `flash` | `(session, text) => Promise<void>` | One-line status-line notice; a no-op without a client. |
| `refreshStatus` | `(session) => Promise<void>` | `refresh-client -S` per attached client, now instead of the next `status-interval`. |

## options.ts

| Export | Kind | Purpose |
|---|---|---|
| `OptionScope` | vocabulary | `as const`: `server`, `session`, `window`, `pane`. |
| `UserOption` | vocabulary | `as const`: `Agent` `@ttt_agent` (pane: owning agent's window name), `Harness` `@ttt_harness` (pane), `Command` `@ttt_command` (pane), `Unread` `@ttt_unread` (window: badge count), `Setup` `@ttt_setup` (session). |
| `PREVIOUS_PREFIX` | constant | `"@ttt_prev_"` — where `pin` saves previous values. |
| `previousKey` | function | `(key) => string` — the saved copy's name for a key. |
| `OptionRef` | type | `{ scope, target?, key }` — target is a session name/id, window id, or pane id; ignored for `server`. |
| `Options` | class | `(run)`. Global (`-g`) is never written. |

| Method | Signature | Purpose |
|---|---|---|
| `get` | `(ref) => Promise<string \| undefined>` | The explicit value on that target; unset user options read as absent, never throw. |
| `getEffective` | `(ref) => Promise<string \| undefined>` | The effective value, following inheritance (`-A`). |
| `set` | `(ref, value) => Promise<void>` | Writes at the ref's scope. |
| `unset` | `(ref) => Promise<void>` | Removes the option; absent options are fine. |
| `pin` | `(ref, value) => Promise<void>` | Saves the previous explicit value under `@ttt_prev_<key>` on the same target first (`"<unset>"` when there was none); a second pin never overwrites the saved original. |
| `restore` | `(ref) => Promise<boolean>` | Puts back the pinned value (or unsets) and drops the saved copy; `false` when nothing was pinned. |

## hooks.ts

`SessionHook`: `{ name, command }`.

`class Hooks(run)` — session-scoped only; global hooks belong to the user's config:

| Method | Signature | Purpose |
|---|---|---|
| `set` | `(session, name, command) => Promise<void>` | Installs a session hook. |
| `unset` | `(session, name) => Promise<void>` | Removes it. |
| `list` | `(session) => Promise<SessionHook[]>` | Hooks explicitly set on the session. |
