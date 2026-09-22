# Developing ttt

## Layout

```
packages/
  tmux/        @ttt/tmux        the tmux adapter, one class per file: runner, context (identity),
                                inventory, sessions, windows, panes, input, screen, options, hooks,
                                profile, setup, composed by the `Tmux` root
  board/       @ttt/board       the message board on disk: messages, receipts, locks, notification markers
  migrations/  @ttt/migrations  ordered schema steps over a session root; rerunnable, with a version ledger
  cli/         @tasarren/ttt    the `ttt` bin: settings, argument parsing, commands, output
```

Ownership rules:

- `@ttt/board` never imports tmux. Delivering text is a callback the CLI passes in
  (`board.deliverNotification(target, token, deliver)`, `board.deliverUrgent(message, recipient, deliver)`).
  Its `unreadCounts()` is a lock-free read of the `state/<name>.unread.json` counters, feeding the
  CLI's badge mirror.
- Badges live in the CLI (`packages/cli/src/badges.ts`), the only place holding both board and tmux.
- `@ttt/migrations` orchestrates `@ttt/board` over a session root and owns the version ledger
  (`state/schema.json`). Steps are idempotent; unknown newer versions are a hard error, never a fallback.
- `@ttt/tmux` never reads settings or the board. It takes `TmuxOptions` and an injectable command
  runner — the only injection point. Every failure surfaces as a typed `TmuxError` over the closed
  `TmuxFailure` vocabulary (`no_server`, `no_session`, `no_target`, `pane_dead`, `bad_option`,
  `no_client`, `timeout`, `unknown`); options are written with explicit targets, never `-g`. It owns
  the `@ttt_*` option names (`UserOption` in `options.ts`); nothing else spells them.
- `process.env` is read in exactly one file, `packages/cli/src/settings.ts` (`TTT_HOME`, `TMUX_PANE`).
  Everything else receives the resolved `Settings` object.
- `packages/cli/src/context.ts` is the composition root: it resolves settings, detects the tmux context,
  and constructs one `Tmux` and one `Board` per invocation. Commands are `(argv, ctx) => Promise<void>`
  and are dispatched from a single map in `main.ts`.
- `packages/cli/src/tmux-context.ts` is the second composition root, for `ttt tmux` verbs only: no
  board, no sender identity. `--session NAME` alone is accepted and `--from` is rejected; running
  outside tmux is fine. `main.ts` routes `tmux` before `createContext`.
- Session records (`~/.ttt/sessions/<S>/session.json`, written by setup, read by doctor) live in
  `packages/cli/src/session-record.ts`, outside the boards on purpose.
- Layouts live in `packages/cli/src/layout.ts` (schema, parser, file io — every error names file
  and path). `LayoutPane.agent` is `true` (the window's main agent, at most one) or a string (a
  second agent's name, checked with `assertName`, never a window's name — `seats agent "X" twice`);
  `title` is a helper-pane title, refused on an agent pane.
  `commands/tmux/build.ts` builds a layout into a session: panes in file order, each extra pane
  split from the pane created last so `pane_index` follows the file (the saved `layout` string binds
  cells by index); the `agent` panes are stamped (main agent, or the named second agent) — a window
  whose panes mark none is built unregistered;
  `title` stamps `@ttt_title`; `setup.ts` validates each pane's `harness` against the declared
  harnesses before building (exit 2 naming the pane); the shorthand `{ "name": "X" }` parses as one
  shell agent pane.
  `save.ts` captures (`savePane` emits `@ttt_title` as `title`; without `@ttt_command` the launch line comes from the process tree via `ps -e`, saver subtree excluded, `source: "tree"`), `restore.ts` restores and lists.
  `createSession` in `commands/tmux/setup.ts` is the shared flow; the placeholder window
  `ttt-setup` exists only until the layout's windows are up. Layout parsing is covered by
  `packages/cli/tests/layout.test.ts`.
- One operation lives in one file. `commands/send.ts` holds `send`, `broadcast`, and `reply` because they
  share the same `deliver` flow; `commands/inbox.ts` holds the read side and its formatters;
  `commands/cancel.ts` owns the sender's retract flow over `board.cancel` and `board.messagesByReplaceKey`.

## Toolchain

Minimum versions: Node 26.8.1, pnpm 11.24.0 (`scripts/check-runtime.mjs` enforces the floor, and
newer is accepted). Source is strict,
erasable ESM TypeScript; relative imports use `.ts` specifiers and run directly under Node's type
stripping. No enums, namespaces, or parameter properties.

```sh
pnpm install
pnpm run typecheck   # tsc over every package and test
pnpm run lint        # eslint (stylistic + typescript-eslint strict, copied from the harness workspace)
pnpm run test        # node --test packages/*/tests/*.test.ts
pnpm run build       # tsdown -> packages/cli/dist/ttt.mjs
pnpm run check       # all of the above, in order
pnpm ttt --help      # run the CLI from source
```

## Dev loop

The package `bin` points at `src/ttt.ts`, so `pnpm add -g .` in `packages/cli` puts a `ttt` on your PATH
that runs the current source. Edit, save, run: no build. `publishConfig.bin` swaps to `dist/ttt.mjs` for
`pnpm pack` and publishing.

`pnpm build` bundles the workspace packages plus `jsonc-parser` into one file with tsdown
(`packages/cli/tsdown.config.ts`, `deps.alwaysBundle`).

Verify inside your own session with `ttt`, not with ad-hoc tmux servers: `.orchestrator/scripts/`
holds `verify-wait.sh`, `verify-seats.sh`, `verify-open.sh`, `verify-teammate-flow.sh`, and
`verify-furniture.sh`, run
from inside the
live ttt session (`sh .orchestrator/scripts/verify-wait.sh`). They exercise the real verbs end
to end, take an optional harness name (default: the settings' default), prefix their
windows with `V-`, and clean up after themselves via a trap.

## How a normal send flows

1. `commands/send.ts` resolves the target windows (lowest id wins on duplicate names; the caller's
   own name is `refusing to send a message to yourself`), reads the body, and calls `board.send`.
2. `board.send` writes `messages/<day>/<id>.json`, appends the thread index, then under each recipient's
   mailbox lock writes an `unread` receipt, bumps the unread counter, supersedes older messages with the
   same `--replace` key, and creates a notification marker (`state/<recipient>.notification.json`,
   carrying that target's resolved delay) if none is live. It returns the new markers.
3. For each marker the CLI spawns a detached copy of itself:
   `ttt --session S --from ttt _notify --target T --token K`.
4. The child heartbeats the marker through the batching window, then (if the token still matches) pastes
   the one-line summary into the target's seat -- resolved by `resolveAgent` in
   `packages/tmux/src/panes.ts`: the pane stamped `@ttt_agent=NAME` anywhere in the session, else the
   first pane of the window called NAME, so an unregistered window still receives -- and marks the
   receipts notified. A newer marker means a
   newer child owns the burst; the old one exits silently. A failed paste cancels the dead token and re-arms
   a live notifier.
5. `main.ts` runs `syncBadges(ctx)` for every non-read-only command (`packages/cli/src/badges.ts`).

Context creation registers the caller's pane on any `ttt` run from inside tmux (never under
`--from`): `registerSeat` stamps `@ttt_agent=NAME` — the window name when
this is the window's first pane and the name is free, else `WINDOW-N` from `generateSeatName`
(lowest N avoiding live windows, live stamps, and mailboxes on disk) — and clears only the same
name elsewhere. Best-effort: a failed stamp never fails the command. Commands under
`--session`/`--from` never register.

## Blocking reads (`--wait`)

`--wait` on `send`/`reply`/`broadcast` blocks until something lands in that thread; `read --wait`
blocks until anything unread arrives. The loop lives in `packages/cli/src/wait.ts`, the send-side
plumbing (`awaitReply`, `refuseMutualWait`) in `commands/send.ts`, presence in `board.ts`
(`announcePresence`, `presence`, `presenceUnlocked`).

- The waiter arms `fs.watch` on `mailboxes/<name>/` first, then writes its presence file
  `state/<name>.waiting.json` (`{ pid, since, expect: "any" | { threadId } }`) — under the mailbox
  lock, cancelling any pending batch marker, so a sleeping notifier exits silently — then scans the
  mailbox once — no lost-wake-up window. A 2 s poll is the inotify safety net; the file is
  withdrawn in `finally`, and SIGINT/SIGTERM share the timeout's abort path. A wait longer than
  half the presence TTL re-announces (`PRESENCE_STALE_AFTER_MS`, exported for the loop in `wait.ts`).
- `board.send` checks presence under the recipient's mailbox lock: a live pid (`kill(0)`) younger
  than 10 minutes means direct delivery — no notification marker, no paste, and the receipt notes
  `(NAME waiting: delivered directly)`. Otherwise the stale presence file is removed and the normal
  path runs, so a crashed waiter's mail is still delivered by the notifier; nothing is lost.
- Delivery time re-checks presence, both for batches (`deliverNotification`) and urgent pastes
  (`deliverUrgent`): when a live waiter sees the fresh mail (`waiterSees` — any wait sees any mail,
  a thread wait only its thread), the paste is skipped, the marker is dropped, and the receipts
  stay unread and unnotified; the next send re-arms if the waiter leaves without reading. A
  mismatched waiter (waiting on another thread) still gets the paste. At announce time the marker
  is already cancelled, so this catches mail sent between announce and delivery.
- `board.send` returns `waiting: string[]` for the queued-line suffix; `refuseMutualWait` turns a
  mutual wait (target waiting on a thread you participate in) into exit 1 — and an urgent to an
  all-waiting audience simply has nobody to paste to (`send.ts` skips `pushUrgent`). `ReadOptions.only`
  restricts a read to given ids, so only the awaited reply is marked read.
- Empty `read --wait` calls ramp up. Without an explicit `--timeout`, `Board.waitTimeout` reads the
  streak file `state/<name>.wait.json` (`WaitStreak`: `{ emptyStreak, updatedAt }`, refreshed under
  the mailbox lock) and returns `min(wait.seconds + WAIT_RAMP_STEP_S * emptyStreak, wait.maxSeconds)`
  (60 s per step, so 120, 180, 240, 300 with defaults); a streak older than the cap starts over at
  base. After the wait, `noteWait(senderName, timedOut)` deletes the streak on arrival, extends it
  on a timeout, and resets it on interrupt; corrupt files count as no streak. `inbox.ts` prints the
  stderr line `ttt: waiting 180s after 1 empty wait; any arrival resets it` on ramped waits only.
  `send --wait`/`reply --wait` (`awaitReply`) never touch the streak: they await one thread, not
  idleness. After `wait.maxIdle` (default 5) consecutive empty waits, the next `read --wait`
  without `--timeout` exits at once (exit 0) with an idle instruction addressed to the waiting
  agent (`... End your turn here. Do not run ttt read --wait again. ...`) instead of waiting —
  unless mail is already unread, which falls through to the wait and arrives immediately. The
  streak stays on an idle exit, so a re-run exits at once too; explicit `--timeout` waits bypass
  the cap but still extend the streak.

`--urgent` skips the marker: the CLI pastes the formatted message right away through
`board.deliverUrgent` (unless the recipient waits and sees it — then the wait delivers), which marks
the receipt notified but leaves it unread.

## Tests

`node:test`, no framework. Unit tests inject a fake tmux runner or a temp `sessionRoot`.
Two e2e suites, each on its own private tmux server socket: `packages/tmux/tests/e2e.test.ts`
(`tmux -L ttt-tmux-e2e-<pid>`, the package verbs) and `packages/cli/tests/e2e.test.ts`
(`tmux -L ttt-e2e-<pid>`, the real CLI from source with the environment tmux gives a process
inside a pane (`TMUX`, `TMUX_PANE`, plus a temp `TTT_HOME` with `notifySeconds: 1`), asserting on
`capture-pane` output and board files). Neither touches your own tmux session. The CLI e2e declares
a `shell` harness in its settings file (`bin sh`, a prompt regex), so its opens never depend on the
machine's `harnesses` section, and covers the seat model end to end ("delivery targets the seat: a
stamp, else the first pane; a second pane becomes WINDOW-N, never the window's name").

## Adding a setting

1. Add the field to `Settings` and `defaultSettings()` in `packages/cli/src/settings.ts`.
2. Add its key to the matching `section(...)` known-key list and read it with `int`/`text_`.
3. Thread it to its consumer through `Context` (or `TmuxOptions` / `BoardOptions` if it belongs there).
4. Document it in the README table and cover it in `settings.test.ts`.

## Adding a command

1. Write the handler in the command file that owns that flow (or a new `commands/<name>.ts`).
2. Register it in `COMMANDS` in `main.ts` and add a line to `USAGE`.
3. Parse arguments with `parseCommandArgs` (`node:util` parseArgs, strict) and `splitAtTerminator` when the
   command takes a `-- body`.
4. Cover it in `e2e.test.ts` if it touches tmux, otherwise in a unit test.

## Adding a tmux verb

1. Write `commands/tmux/<verb>.ts` as a `TmuxVerb`.
2. Register it in `VERBS` in `commands/tmux/index.ts` and add it to `TMUX_USAGE`.
3. Cover it in `packages/tmux/tests/e2e.test.ts` or the CLI e2e. Verbs starting with `_` are
   internal hook entries and stay out of the usage list.

## Adding a schema version

1. Append one step in `packages/migrations/src/steps/` and register it in `manifest.ts`. The steps so
   far: `rebuild-thread-index` v4→5, `build-unread-index` v5→6, `drop-pane-registry` v6→7 (deletes
   `state/panes.json`, the pre-tagging pane registry). Bump `CURRENT_SCHEMA_VERSION` (7) and
   `BOARD_VERSION` together.
2. Steps are idempotent and rerunnable. They count first for `--dry-run` and write only on a real run.
3. Readers stay strict: unknown newer versions are a hard error pointing at `ttt migrate`. No fallbacks.
4. Record the ledger in `state/schema.json` and cover the step in `migrations.test.ts` (dry-run counts,
   idempotent rerun, newer-than-code refusal).

## tmux verb files

- `packages/cli/src/context.ts` builds the `Context`. `registerSeat` (first `ttt` run from a pane,
  any command) stamps the pane: already stamped -> keep the name; the window's first pane and a
  free name -> the window's name; else `WINDOW-N`, lowest N not a live window, a live stamp, or a
  mailbox on disk. `Context.windowName` is the caller's window, `Context.claimed` says whether this
  run did the stamping (the `(registered now as NAME ...)` pane line in `whoami`). `requireAgent`
  resolves a messaging target to `Agent = { window, seat }` via `agentIn` (`resolveAgent`: a stamp
  anywhere in the session, else the window's first pane); `isSelf(ctx, name)` compares names, so a
  second agent may message its window's main agent.
- `commands/panes.ts` is `ttt panes [--window NAME] [--json]`: one `PaneRow` per pane (`index`,
  `pane`, `agent` (the stamp, or the window name when the pane is the seat), `seat`, `registered`,
  `runs` (harness, else title, else command), `dead`).
- `commands/tmux/target.ts` holds the shared pane truth: `requireSession`, `resolveAgentTarget`
  (any NAME: its seat via `resolveAgent`, so an unregistered window resolves to its first pane),
  `resolvePaneTarget` (`parsePaneAddress`: NAME -> seat, NAME.N -> `pane_index`, %id; `agent` is
  the agent seated there if any), and `requireTypable` (the two refusals: dead pane,
  `synchronize-panes` on).
- `lifecycle.ts` is open/close/rename/split/respawn; `typing.ts` is type/press/interrupt; `screen.ts`
  is wait/popup/flash. The interactive setup wizard lives in `setup.ts`. Pastes go through
  `Input.sendText` (`@ttt/tmux`), which waits for 2 s of screen quiet first
  (`Screen.waitForQuiet`, hashes only, 15 s cap, urgent skips it) so a notification never
  clears a line a human is typing in.
- `normalize-window.ts` (the hook verb) pins the profile on a new window and, when tmux named the
  window itself, renames it `W-N` — `FURNITURE_STEM` in `names.ts` and `isScratchName`, the one
  shape `broadcast --all` skips. Lowest free N against live
  windows and mailbox directories. It never stamps.
- `packages/cli/src/harnesses.ts` owns the harness settings: `HarnessSettings` (`declared`,
  `defaultName`, `source`), `ResolvedHarness` (`name`, `bin`, `ready`, `limited?`, `note?`), `shippedHarnesses`
  (no `harnesses` section: every preset allowed, no default), and `parseHarnesses` (only declared
  names allowed; `bin`/`ready` required without a preset; exactly one `default: true`; overriding
  `ready` drops the preset's note; `limited` is a placeholder — parsed and carried, matched nowhere
  yet, until each harness's out-of-tokens screen line is captured from a real limited pane). `settings.ts` parses the section into `Settings.harnesses` and
  carries `Settings.path` (the caller's `PATH`) so `doctor` can find binaries.
- `lifecycle.ts` resolves what a pane runs: `withBareValues` (a lone `--harness` or `--pane` is a
  flag, not a value), `resolveProgram`/`pickHarness` (default or declared harness, the exact refusal
  lines), `pickWindow`/`takenNames` (a new name avoids live windows, live stamps, and mailboxes), and
  `awaitReady` (harness regex or `--ready`, visible screen only). `open --pane` with a harness seats
  a second agent (`@ttt_agent=NAME` on its own pane); without one it is a titled helper. A shell
  `--window` start stamps nothing; only a harness or COMMAND stamps, and the harness stamps
  `@ttt_harness` + `@ttt_command` alongside the agent stamp.
- `names.ts` owns window names: `MAX_WINDOW_NAME` (12, fits the bar), `checkWindowName` (charset
  plus the length error), `generateWindowName` (`<STEM>-N` from the resolved harness or `W`,
  lowest N free of live windows *and* mailbox directories — a reused name would silently inherit an
  old inbox), `generateSeatName` (second agents: `WINDOW-N` counting from 2 — the window's own name
  is seat 1), and `mailboxNames`.
- `doctor`'s window findings (`windowFindings(window, historyLimit, live)`) report unregistered
  windows (`ok window X: unregistered: pane 1 receives until something there runs ttt` —
  information, no fix), a second agent's stamp colliding with a window name (`warn window X: pane
  %id is stamped @ttt_agent=Y, also the name of window @id; messages to Y land here, not there`),
  twin stamps (`warn window X: panes %a and %b are both stamped @ttt_agent=Y; the first wins`),
  dead panes (the fix names the seated agent, `ttt tmux respawn REVIEWER-2`),
  and thin history. `harnessFindings` lists the section and finds each `bin` on `Settings.path`
  (`findBinary`: absolute as is, else first PATH hit), warning when it is missing. It also reports
  skill installs, read-only (`skill-status.ts` walks `~/.agents/skills`,
  `~/.claude/skills`, `~/.codex/skills`, `~/.config/opencode/skills`, `~/.cursor/skills`,
  `~/.gemini/skills`, `~/.copilot/skills`): ok when a copy or symlink matches the binary version,
  warn on stale versions (fix: `npx skills update ttt` for copies, update the checkout for
  symlinks), broken links, and no install at all. ttt never installs skills, never prompts, and
  never writes to agent directories; the tarball ships `skills/ttt/SKILL.md` (`files` + `prepack`),
  and that is the whole story.

## Structure audit (2026-09 cleanup)

Source is ~5,030 lines across the four packages.

- `packages/board/src/board.ts` (809 lines) is intentionally large: one cohesive board
  owner covering send/read/ack/notify/schema/prune/thread-index. Split
  only on unrelated reasons to change, never on length alone.
- `packages/tmux/src/` (1,286 lines, 14 files) is one class per file composed by the
  `Tmux` root; largest is `inventory.ts` (186 lines), which also owns the tree parsers.
- `packages/cli/src/commands/inbox.ts` (264 lines) keeps the read side and its
  formatters together. The formatters have one caller; moving them out would shred
  the flow.
- Shared helpers live with their owner: `winnersByName` beside `compareWindowIds`
  in `@ttt/tmux`, `readdirRecursive` and `isErrno` in `@ttt/board`, `messageTags`
  local to the inbox formatters.
- Test tmp roots stay per-package. Sharing fixtures across packages would couple
  owners for ~6 lines; `board.test.ts` reuses its own `freshSession` overrides instead.

## Release

Releases are owner-gated in two steps: publishing a GitHub Release (tag `vX.Y.Z`, matching
`packages/cli` version) runs `.github/workflows/release.yml`, which verifies the tag, dry-runs the pack,
and *stages* the package on npm via OIDC trusted publishing. A maintainer then approves it
(`pnpm stage approve <id>` with 2FA, or the Approve button on npmjs.com) and only then does the version
go live. Merging to `main` never publishes; neither does a bare tag push without a release. Prereleases
are skipped by the workflow and never reach npm. The trusted publisher entry is stage-only on purpose:
CI can stage, only humans can ship. First-ever publish is manual
(the package must exist before a trusted publisher can be attached):
`pnpm --filter @tasarren/ttt publish --access public` from a clean checkout, then attach the trusted
publisher (repo `tasarren/ttt`, workflow `release.yml`, no environment) on the package page. Never
publish from a dev machine after that.

`@tasarren/tmux` is pack-ready (own tsdown build, `pnpm pack --dry-run` proves the tarball) but has
no release path yet: the release workflow is not extended, and nothing goes to npm from this
branch. Its `prepack` copies `docs/tmux-api.md` as the package README, so that file *is* the
published README — keep it a reference.

One version, three places: `packages/cli/package.json` is the single source;
`packages/cli/src/version.ts` (generated; inlined into the bundle, which has no package.json next
to it) and the `skills/ttt/SKILL.md` frontmatter must match it. `pnpm run version:check` (part of
`pnpm run check`) asserts this; `pnpm run version:sync` rewrites them after a bump.

```sh
pnpm run check
# bump packages/cli version, merge via PR, then press Publish on a GitHub Release
# (or: gh release create vX.Y.Z --generate-notes)
```

Local tarball check (no registry involved):

```sh
cd packages/cli
pnpm pack --dry-run             # asserts dist/ttt.mjs + README + LICENSE land in the tarball
pnpm pack                       # tasarren-ttt-<version>.tgz with bin -> dist/ttt.mjs
pnpm add -g ./tasarren-ttt-*.tgz  # install the tarball anywhere
```
