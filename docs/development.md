# Developing ttt

## Layout

```
packages/
  tmux/        @ttt/tmux        the tmux adapter: detect context, list windows, paste text, capture a pane
  board/       @ttt/board       the message board on disk: messages, receipts, locks, notification markers
  migrations/  @ttt/migrations  ordered schema steps over a session root; rerunnable, with a version ledger
  cli/         @ttt/cli         the `ttt` bin: settings, argument parsing, commands, output
```

Ownership rules:

- `@ttt/board` never imports tmux. Delivering text is a callback the CLI passes in
  (`board.deliverNotification(target, token, deliver)`, `board.deliverUrgent(message, recipient, deliver)`).
- `@ttt/migrations` orchestrates `@ttt/board` over a session root and owns the version ledger
  (`state/schema.json`). Steps are idempotent; unknown newer versions are a hard error, never a fallback.
- `@ttt/tmux` never reads settings or the board. It takes `TmuxOptions` and an injectable command runner.
- `process.env` is read in exactly one file, `packages/cli/src/settings.ts` (`TTT_HOME`, `TMUX_PANE`).
  Everything else receives the resolved `Settings` object.
- `packages/cli/src/context.ts` is the composition root: it resolves settings, detects the tmux context,
  and constructs one `Tmux` and one `Board` per invocation. Commands are `(argv, ctx) => Promise<void>`
  and are dispatched from a single map in `main.ts`.
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
   the one-line summary into the window and marks the receipts notified. A newer marker means a newer
   child owns the burst; the old one exits silently. A failed paste cancels the dead token and re-arms
   a live notifier.

`--urgent` skips the marker: the CLI pastes the formatted message right away through
`board.deliverUrgent`, which marks the receipt notified but leaves it unread.

## Tests

`node:test`, no framework. Unit tests inject a fake tmux runner or a temp `sessionRoot`.
`packages/cli/tests/e2e.test.ts` starts a private tmux server on its own socket (`tmux -L ttt-e2e-<pid>`),
creates windows `A` and `B`, runs the real CLI from source with the environment tmux gives a process
inside a pane (`TMUX`, `TMUX_PANE`, plus a temp `TTT_HOME` with `notifySeconds: 1`), and asserts on
`capture-pane` output and board files. It never touches your own tmux session.

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

## Adding a schema version

1. Append one step in `packages/migrations/src/steps/` and register it in `manifest.ts`. Bump
   `CURRENT_SCHEMA_VERSION` and `BOARD_VERSION` together.
2. Steps are idempotent and rerunnable. They count first for `--dry-run` and write only on a real run.
3. Readers stay strict: unknown newer versions are a hard error pointing at `ttt migrate`. No fallbacks.
4. Record the ledger in `state/schema.json` and cover the step in `migrations.test.ts` (dry-run counts,
   idempotent rerun, newer-than-code refusal).

## Release

```sh
pnpm run check
cd packages/cli
pnpm pack                       # ttt-cli-<version>.tgz with bin -> dist/ttt.mjs
pnpm add -g ./ttt-cli-*.tgz     # install the tarball anywhere
```
