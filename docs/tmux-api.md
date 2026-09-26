# `@tasarren/tmux` — API reference

A semantic tmux API: every verb parses, validates, or scopes; there is no raw-command passthrough.
Targets are ids (`@n` windows, `%n` panes), never `session:name` strings built by callers; indices
are tmux-relative and never assumed to start at 0. One class per file, composed by the `Tmux` root;
the runner is the only injection point, so tests run against a fake.

Install (when published): `pnpm add @tasarren/tmux`.

```ts
import { Tmux, createRunner } from "@tasarren/tmux"

const tmux = new Tmux(options, createRunner({ socket: "my-team" }))
await tmux.requireVersion()
const tree = await tmux.inventory.tree("work")
```

## Root

```ts
new Tmux(options: TmuxOptions, run?: TmuxRunner, ancestors?: AncestorResolver)
```

Holds one runner and one option set; the CLI composes exactly one `Tmux` per invocation.

| Member | Type |
|---|---|
| `inventory` | `Inventory` |
| `sessions` | `Sessions` |
| `identity` | `Identity` |
| `windows` | `Windows` |
| `panes` | `Panes` |
| `input` | `Input` |
| `screen` | `Screen` |
| `options` | `Options` |
| `hooks` | `Hooks` |
| `setup` | `Setup` |

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
| `TmuxSession` | `id`, `name`, `attached`, `group` (session group name when the session shares windows with others) |
| `TmuxWindow` | `name`, `id` |
| `LivePane` | `session`, `window`, `windowId`, `pane`, `index`, `pid`, `agent` (`@ttt_agent`, when stamped) |
| `TreePane` | `LivePane` plus `active`, `dead`, `cwd`, `command` (process name only), `title` (pane title), `harness` (`@ttt_harness`), `startCommand` (`@ttt_command`; never `pane_start_command`), `historyLimit`, `paneTitle` (`@ttt_title`, when stamped) |
| `TreeWindow` | `TmuxWindow` plus `index`, `active`, `panes` |
| `TreeSession` | `TmuxSession` plus `windows` |

`class Inventory(run)`, all rows typed; malformed lines are skipped, never thrown:

| Method | Signature | Purpose |
|---|---|---|
| `listSessions` | `() => Promise<TmuxSession[]>` | Every session on the server; an empty list when no server is running. |
| `hasSession` | `(name: string) => Promise<boolean>` | Membership check. |
| `listWindows` | `(session: string) => Promise<TmuxWindow[]>` | Windows of one session, with ids. |
| `listBadges` | `(session: string) => Promise<Array<TmuxWindow & { unread: number }>>` | Windows with the unread badge each currently shows (`@ttt_unread`, 0 when unset), in one round trip. |
| `listAllPanes` | `() => Promise<LivePane[]>` | Every live pane on the server (used by identity detection). |
| `serverInfo` | `() => Promise<ServerInfo>` | `{ version, socketPath, configFiles }` of the server, in one `display-message`. |
| `tree` | `(session: string) => Promise<TreeSession>` | Session > Window > Pane in tmux order; panes sorted by index. |

## windows.ts

| Export | Kind | Purpose |
|---|---|---|
| `compareWindowIds` | function | `(a, b) => number` — numeric order of `@n`; non-numeric ids fall back to string order. |
| `winnersByName` | function | `<W extends TmuxWindow>(windows: W[]) => Map<string, W>` — lowest id wins per name; duplicate names share one mailbox. |
| `OpenWindowInput` | type | `{ session, name, cwd?, command? }`. |
| `Windows` | class | `(run, inventory)`. Window lifecycle and lookup; names are resolved here and nowhere else. |

| Method | Signature | Purpose |
|---|---|---|
| `find` | `(session, name) => Promise<TmuxWindow \| undefined>` | Duplicate names resolve to the lowest id. |
| `open` | `(input: OpenWindowInput) => Promise<{ windowId, paneId }>` | Creates a detached window; returns its id and first pane id. |
| `close` | `(windowId: string) => Promise<void>` | Kills the window. |
| `rename` | `(windowId: string, name: string) => Promise<void>` | `rename-window` on the id. The CLI refuses to rename a window whose name is a mailbox key (its main agent's identity), and refuses a NEW that is a live agent name. |
| `layout` | `(windowId: string) => Promise<string>` | The window's `#{window_layout}` string: pane geometry that `applyLayout` replays exactly. |
| `applyLayout` | `(windowId, layout) => Promise<void>` | `select-layout` replay onto a window that already has the same number of panes. |

## panes.ts

| Export | Kind | Purpose |
|---|---|---|
| `PaneStamp` | type | `{ agent?, harness?, command?, title? }` — what ttt stamps on a pane it starts or identifies; each field maps to one `@ttt_*` option. `agent` is the agent seated here: the window's name for its main agent, `WINDOW-N` or a given name for a second agent, absent for titled helpers. `title` is a helper pane's border title and never set together with `agent`. |
| `AgentSeat` | type | `{ windowId, windowName, paneId, registered }` — where an agent's messages land, and whether a stamp says so (`registered: false` = the window's lowest pane stands in). |
| `resolveAgent` | function | `(live: LivePane[], window: TmuxWindow \| undefined, name: string) => AgentSeat \| undefined` — one pane truth for notify, capture and typing: the pane stamped `@ttt_agent=NAME` anywhere in the session wins (a second agent lives in another agent's window); without a stamp, the window called NAME seats its main agent in its lowest-index pane, so a window is reachable before anything there has run ttt. `undefined` only when neither stamp nor window exists. Pure. |
| `PaneAddress` | type | `{ kind: "agent", window } \| { kind: "index", window, index } \| { kind: "id", pane }` — NAME (the window's agent pane), NAME.N (`pane_index`, base-index aware), or %id. |
| `parsePaneAddress` | function | `(text) => PaneAddress \| undefined` — the three forms above; anything else is `undefined`. |
| `SplitDirection` | vocabulary | `as const`: `vertical` (`-v`), `horizontal` (`-h`). |
| `SplitPaneInput` | type | `{ target, direction, sizePercent?, cwd?, command? }` — `target` is a window or pane id; `sizePercent` is a percentage of the split target. |
| `Panes` | class | `(run, options)`. Every verb takes a pane or window id and returns ids. |

| Method | Signature | Purpose |
|---|---|---|
| `stamp` | `(paneId, live, stamp: PaneStamp) => Promise<void>` | Marks the pane with the given stamps. With `agent`, clears `@ttt_agent` from every other pane in the session carrying the same name, so one name sits in one pane (a dedupe, never a blanket clear — other agents' stamps are untouched). Writes only what differs; a pane already stamped costs nothing. |
| `split` | `(input: SplitPaneInput) => Promise<string>` | Creates a detached pane; returns its id. |
| `kill` | `(paneId: string) => Promise<void>` | Kills the pane. |
| `respawn` | `(paneId: string, command?: string, cwd?: string) => Promise<void>` | Restarts the pane's command; `-k` kills a still-running one first, so the verb is idempotent. `cwd` starts it elsewhere (adoption). |
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
| `UserOption` | vocabulary | `as const`: `Agent` `@ttt_agent` (pane: owning agent's window name), `Harness` `@ttt_harness` (pane), `Command` `@ttt_command` (pane), `Title` `@ttt_title` (pane: helper-pane title), `Unread` `@ttt_unread` (window: badge count), `Setup` `@ttt_setup` (session). |
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
| `pin` | `(ref, value) => Promise<void>` | Saves the previous explicit value under `@ttt_prev_<key>` on the same target first (`"<unset>"` when there was none); a second pin never overwrites the saved original. On a server option the effective value is saved instead — server options have no parent to inherit from — and `restore` writes it back explicitly. |
| `restore` | `(ref) => Promise<boolean>` | Puts back the pinned value (or unsets) and drops the saved copy; `false` when nothing was pinned. |

## harness.ts

What `open --harness H` knows about a harness (an agent program that runs in a pane — claude,
opencode, codex, whatever the operator declares; a shell is not a harness): how to start it and
which screen line means it accepts input. Only entries observed on a real start ship here; each
preset carries the version and date it was verified against (tmux 3.7c at 160x40). The operator's
settings file may override `bin`/`ready` and declare more.

| Export | Kind | Purpose |
|---|---|---|
| `Harness` | vocabulary | `as const`: `claude`, `opencode` (v1), `opencode2` (v2), `codex`. |
| `HarnessPreset` | type | `{ command, ready: RegExp, note? }` — `ready` matches one screen line once the harness accepts input; `note` warns the operator (codex's trust prompt, claude's trust-configuration prompt). |
| `HARNESS_PRESETS` | constant | The four presets, each with its verification comment (e.g. opencode2 2.0.12, 2026-09-24: the input placeholder). Notes where trusting is involved: claude — a folder with pre-approved permissions asks 'Only proceed if you trust this configuration' first; answer with `ttt tmux press NAME Down` then `Enter`, or start it in a trusted `--cwd`. codex — an unseen directory asks 'Do you trust the contents' first; answer with `ttt tmux press NAME Enter` or a trusted `--cwd`. The note is appended to the open timeout message and only while the preset's `ready` is still in use. |
| `harnessPreset` | function | `(name) => HarnessPreset | undefined` — lookup by name. |

## hooks.ts

`SessionHook`: `{ name, command }`.

`class Hooks(run)` — session-scoped only; global hooks belong to the user's config:

| Method | Signature | Purpose |
|---|---|---|
| `set` | `(session, name, command) => Promise<void>` | Installs a session hook. |
| `unset` | `(session, name) => Promise<void>` | Removes it. |
| `list` | `(session) => Promise<SessionHook[]>` | Hooks explicitly set on the session. |
| `failures` | `(needle: string) => Promise<string[]>` | Lines from `tmux show-messages` matching `needle` — how hook failures surface for `doctor`. |

## sessions.ts

`CreateSessionInput`: `{ name, windowName?, cwd?, command?, width?, height? }` — dimensions are the initial size of a detached session; clients resize on attach.

`class Sessions(run)` — sessions are created detached; attaching is the human's move:

| Method | Signature | Purpose |
|---|---|---|
| `create` | `(input: CreateSessionInput) => Promise<{ sessionId, windowId, paneId }>` | New detached session; returns its id and its first window and pane ids. |
| `kill` | `(name: string) => Promise<void>` | Kills the session. |

## profile.ts

| Export | Kind | Purpose |
|---|---|---|
| `SetupMode` | vocabulary | `as const`: `pin` (set and save the original), `pin-lower-only` (pin only when the current value is higher), `assert` (report only). |
| `ProfileOption` | type | `{ scope, key, value, mode, why }` — one row of a profile. |
| `SetupProfile` | type | `{ name, options: ProfileOption[] }`. |
| `AGENTS_PROFILE` | constant | The built-in `agents` profile: rename off, `remain-on-exit` on, `synchronize-panes` off, border and status formats, index 1, `renumber-windows`, `history-limit` 10000, `destroy-unattached`/`detach-on-destroy` off, bells off, `status` on, `aggressive-resize` assert, `escape-time` lower-only, `focus-events` on. |
| `PROFILES` | constant | Profiles by name (`agents` today). |
| `FURNITURE_MARK` | constant | `"·"` — trailing mark on a window tab whose panes carry no `@ttt_agent` stamp (unregistered: nothing there has run ttt yet, the first pane receives). |
| `PANE_BORDER_FORMAT`, `WINDOW_STATUS_FORMAT`, `WINDOW_STATUS_CURRENT_FORMAT` | constants | The exact border and tab formats (tabs carry the unread badge; the current tab is bold). The tab dot marks an unregistered window via `#{P:#{@ttt_agent}}` (joins every pane's stamp; empty plus `FURNITURE_MARK` — the export name stays, the concept is "nothing registered here yet"). The border names the pane first — agent name, else pane title, else `pane N · command` — then the harness when ttt started one there, the cwd, and a dead marker. |

## setup.ts

| Export | Kind | Purpose |
|---|---|---|
| `NORMALIZE_HOOK` | constant | `"after-new-window"` — the session hook that normalizes windows humans open later; the command is supplied by the CLI (absolute path). |
| `CheckState` | vocabulary | `as const`: `ok`, `off`, `pinned`. |
| `OptionCheck` | type | `{ scope, target, key, wanted, found, mode, state, why }` — `target` is a session name, window id, or `""` for server. |
| `SetupReport` | type | `{ session, profile, checks: OptionCheck[], hookInstalled }` — `pinned` rows were changed. |
| `Setup` | class | `(options, hooks, inventory)`. Applies a profile with every change reversible via `@ttt_prev_*`. |

| Method | Signature | Purpose |
|---|---|---|
| `apply` | `(session, profile, hookCommand) => Promise<SetupReport>` | Session and server options once, window options on every window, the normalize hook, and `@ttt_setup=<profile>`. Idempotent. |
| `applyWindow` | `(windowId, profile) => Promise<OptionCheck[]>` | The window-scoped part of `apply` for one window; what the hook runs. |
| `check` | `(session, profile) => Promise<SetupReport>` | Reports without writing: every option on every target, plus hook and marker presence. |
| `revert` | `(session, profile) => Promise<number>` | Restores every pinned option, removes the hook and marker; returns how many were restored. |
