# `@tasarren/tmux` — programmatic API

<!-- DRAFT (plan 3): skeleton only, from plan section 3. Exact signatures land with FABLE's step-1 message; do not merge until unmarked. -->

A semantic tmux API: every verb parses, validates, or scopes. There is no raw-command passthrough —
anything a caller can express is one of the verbs below, and every verb returns typed objects or
throws a typed error. Built for agents and tools that drive tmux without learning its CLI.

Conventions:

- Ids in, ids out. Never build or accept `session:name` target strings; indices are tmux-relative
  and never assumed to start at 0.
- Options are set with explicit targets, never globally, except two server-scoped options.
- Pinned options save their previous value as `@ttt_prev_<key>` on the same target, so a revert
  needs no file and dies with the server.
- The runner is the only injection point; everything else is constructed once with its options.
- User options read by this package live in one closed vocabulary (`@ttt_agent`, `@ttt_harness`,
  `@ttt_command`, `@ttt_unread`, `@ttt_setup`, `@ttt_prev_*`).

## Construction

| Piece | Purpose |
|---|---|
| `createRunner({ socket?, socketPath? })` | Command runner; `-L` / `-S` selection and a minimum tmux version check (`requireVersion("3.2")`). |
| `Tmux` | Root class. Holds the runner and options; composes the sub-objects below. |

## Modules

One class per file; pure helpers stay functions.

| File | Exposes | Methods and purpose |
|---|---|---|
| `runner.ts` | `TmuxRunner` | Run tmux commands with socket selection, version checks, and stderr-to-failure mapping. |
| `context.ts` | `detectContext`, `procAncestors`, `DetectionSource` | Detect the calling pane from the process tree or the tmux environment. |
| `inventory.ts` | `Inventory` | `listSessions`, `listWindows`, `listAllPanes` (carrying the `@ttt_*` tags), and `tree(session)` — a live `Session > Window > Pane` view with `{id, index, active, dead, pid, cwd, title, tags}`. |
| `windows.ts` | `Windows` | `open({session, name, cwd, command, harness})`, `close`, `find`, plus the pure `winnersByName` / `compareWindowIds` for duplicate names. |
| `panes.ts` | `Panes` | `split({windowId, direction, size, cwd, command})`, `kill`, `respawn`, `stamp(paneId, tags)`, and the pure `resolveAgentPane` — tagged pane, else lowest relative index, else the window. |
| `input.ts` | `Input` | `paste(target, text, {enter})` via a private buffer with bracketed paste for `type`, `press(target, key)`, `interrupt(target)`. Refuses to paste into a pane with `synchronize-panes` on — one paste would hit every pane. |
| `screen.ts` | `Screen` | `capture`, `waitFor(target, pattern, timeoutMs, pollMs)`, `popup`, `flash`, `refreshStatus`. |
| `options.ts` | `Options` | `OptionScope` (`server \| session \| window \| pane`); `get`, `set`, `unset` per scope; `pin(target, key, value)` (previous value saved first) and `restore(target)`. |
| `hooks.ts` | `Hooks` | `set`, `unset`, `list` for session hooks. |
| `profile.ts` | `SetupProfile` | The normalization profile type and the built-in `agents` profile. |
| `setup.ts` | `Setup` | `apply(session, profile) -> SetupReport` and `revert(session)`: pin the option matrix, install the new-window hook, report what changed. |

## Errors

Failures are a closed vocabulary derived from tmux stderr (`no_server`, `no_session`, `no_target`,
`pane_dead`, `bad_option`, `no_client`, `unsupported_version`, `unknown`) and surface as one typed
error with a code, target, and cause. `send-keys` to a dead pane succeeds silently in tmux, so
input verbs check pane state first.

Exact signatures land with the implementation; this document becomes the package README.
