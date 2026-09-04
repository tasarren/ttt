# ttt workspace contract

`ttt` is durable, batched messaging between the windows of one tmux session. Read `docs/development.md`
before changing a package.

## Ownership

- `@ttt/tmux` owns talking to tmux. `@ttt/board` owns the message board on disk and never imports tmux.
  `@tasarren/ttt` owns settings, argument parsing, commands, output, and the only bin.
- `process.env` is read only in `packages/cli/src/settings.ts`. Everything else receives typed options.
- One operation, one file. Split only on unrelated reasons to change; length is not a reason.
- No forwarding layers, no `utils`/`helpers` buckets, no interface with a single implementation. The two
  substitution boundaries are the tmux command runner and the board's `deliver` callbacks.

## Standards

- Node 26.8.1 and pnpm 11.24.0 exactly for development. Corepack/pnpm only; never npm, tsx, or Bun.
- Strict, erasable ESM TypeScript with `.ts` import specifiers. Lint and tsconfig are copied from the
  `@uft-ai` harness workspace; do not loosen them.
- Repeated domain values are `as const` vocabularies beside their types (`MessageKind`, `ReceiptState`).
- Tests use `node:test`, strict assertions, real files and a real private tmux server. No skipped tests.
- Deliberate shortcuts carry a `// ponytail:` comment naming the ceiling.

## Before closing a change

`pnpm run check` must pass: runtime check, typecheck, lint, tests (including the tmux e2e), build.
Update `README.md` when behavior or settings change, in the same change.
