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
  and path). `commands/tmux/build.ts` builds a layout into a session (open, split, `applyLayout`,
  stamp); `save.ts` captures, `restore.ts` restores and lists. `createSession` in
  `commands/tmux/setup.ts` is the shared flow; the placeholder window `ttt-setup` exists only until
  the layout's windows are up. Layout parsing is covered by `packages/cli/tests/layout.test.ts`.
- One operation lives in one file. `commands/send.ts` holds `send`, `broadcast`, and `reply` because they
  share the same `deliver` flow; `commands/inbox.ts` holds the read side and its formatters.

## Toolchain

Exact versions: Node 26.8.1, pnpm 11.24.0 (`scripts/check-runtime.mjs` enforces them). Source is strict,
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

## How a normal send flows

1. `commands/send.ts` resolves the target windows (lowest id wins on duplicate names, must not be the
   caller), reads the body, and calls `board.send`.
2. `board.send` writes `messages/<day>/<id>.json`, appends the thread index, then under each recipient's
   mailbox lock writes an `unread` receipt, bumps the unread counter, supersedes older messages with the
   same `--replace` key, and creates a notification marker (`state/<recipient>.notification.json`,
   carrying that target's resolved delay) if none is live. It returns the new markers.
3. For each marker the CLI spawns a detached copy of itself:
   `ttt --session S --from ttt _notify --target T --token K`.
4. The child heartbeats the marker through the batching window, then (if the token still matches) pastes
   the one-line summary into the target's agent pane -- resolved by `resolveAgentPane` in
   `packages/tmux/src/panes.ts`: the pane stamped `@ttt_agent` with the window name, else the
   lowest-index pane, else the window id -- and marks the receipts notified. A newer marker means a
   newer child owns the burst; the old one exits silently. A failed paste cancels the dead token and re-arms
   a live notifier.
5. `main.ts` runs `syncBadges(ctx)` for every non-read-only command (`packages/cli/src/badges.ts`).

Context creation stamps `@ttt_agent` with the caller's window name onto the caller's pane whenever
identity came from the PID walk, and clears sibling stamps in that window (at most one agent pane
per window). Best-effort: a failed stamp never fails the command. Commands identified via
`pane-env` or `--session`/`--from` never stamp.

## Blocking reads (`--wait`)

`--wait` on `send`/`reply`/`broadcast` blocks until something lands in that thread; `read --wait`
blocks until anything unread arrives. The loop lives in `packages/cli/src/wait.ts`, the send-side
plumbing (`awaitReply`, `refuseMutualWait`) in `commands/send.ts`, presence in `board.ts`
(`announcePresence`, `presence`, `presenceUnlocked`).

- The waiter arms `fs.watch` on `mailboxes/<name>/` first, then writes its presence file
  `state/<name>.waiting.json` (`{ pid, since, expect: "any" | { threadId } }`), then scans the
  mailbox once — no lost-wake-up window. A 2 s poll is the inotify safety net; the file is
  withdrawn in `finally`, and SIGINT/SIGTERM share the timeout's abort path.
- `board.send` checks presence under the recipient's mailbox lock: a live pid (`kill(0)`) younger
  than 10 minutes means direct delivery — no notification marker, no paste, and the receipt notes
  `(NAME waiting: delivered directly)`. Otherwise the stale presence file is removed and the normal
  path runs, so a crashed waiter's mail is still delivered by the notifier; nothing is lost.
- `board.send` returns `waiting: string[]` for the queued-line suffix; `refuseMutualWait` turns a
  mutual wait (target waiting on a thread you participate in) into exit 1. `ReadOptions.only`
  restricts a read to given ids, so only the awaited reply is marked read.

`--urgent` skips the marker: the CLI pastes the formatted message right away through
`board.deliverUrgent`, which marks the receipt notified but leaves it unread.

## Tests

`node:test`, no framework. Unit tests inject a fake tmux runner or a temp `sessionRoot`.
Two e2e suites, each on its own private tmux server socket: `packages/tmux/tests/e2e.test.ts`
(`tmux -L ttt-tmux-e2e-<pid>`, the package verbs) and `packages/cli/tests/e2e.test.ts`
(`tmux -L ttt-e2e-<pid>`, the real CLI from source with the environment tmux gives a process
inside a pane (`TMUX`, `TMUX_PANE`, plus a temp `TTT_HOME` with `notifySeconds: 1`), asserting on
`capture-pane` output and board files). Neither touches your own tmux session.

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

## Structure audit (2026-09 cleanup)

Source is ~2,580 lines. `jscpd --min-lines 10` reports 0 clones; `--min-lines 5`
reports only small shared guards (winner-pick, readdir guard, inbox tags), each with
one shared helper.

- `packages/board/src/board.ts` (764 lines) is intentionally large: one cohesive board
  owner covering send/read/ack/notify/schema/prune/thread-index. Split
  only on unrelated reasons to change, never on length alone.
- `packages/tmux/src/` (902 lines, 11 files) is one class per file composed by the
  `Tmux` root; largest is `inventory.ts` (129 lines), which also owns the tree parsers.
- `packages/cli/src/commands/inbox.ts` (250 lines) keeps the read side and its
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
