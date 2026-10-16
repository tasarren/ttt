# ttt workspace contract

`ttt` is durable, batched messaging between the windows of one tmux session. Read `docs/development.md`
before changing a package.

## Ownership

- `@ttt/tmux` owns talking to tmux. `@ttt/board` owns the message board on disk and never imports tmux.
  `@tasarren/ttt` owns settings, argument parsing, commands, output, and the only bin.
- Application `process.env` reads live only in `packages/cli/src/settings.ts`; application code
  receives typed options. Tests and verification scripts may set isolated child-process environments.
- One operation, one file. Split only on unrelated reasons to change; length is not a reason.
- No forwarding layers, no `utils`/`helpers` buckets, no interface with a single implementation. The two
  substitution boundaries are the tmux command runner and the board's `deliver` callbacks.

## Standards

- Corepack/pnpm only; never npm, tsx, or Bun. CI selects its Node and pnpm versions.
- Reproduce CI with `sh .orchestrator/scripts/verify-container.sh [TMUX_VERSION ...]`.
  Keep alternate runtimes/tmux builds inside Docker; no host installs or configuration mounts.
- Put reusable maintenance and verification scripts in `.orchestrator/scripts/`, not inline shell
  heredocs or workflow bodies. Keep inline commands to short, one-off operations or script invocations.
- Use `.orchestrator/tmp/` for scratch files, audit logs, downloads, and disposable checkouts, not
  `/tmp`. Keep durable plans in `.orchestrator/plans/`; do not commit temporary artifacts.
- Strict, erasable ESM TypeScript with `.ts` import specifiers. Lint and tsconfig are copied from the
  `@uft-ai` harness workspace; do not loosen them.
- Repeated domain values are `as const` vocabularies beside their types (`MessageKind`, `ReceiptState`).
- Tests use `node:test`, strict assertions, real files and a real private tmux server. No skipped tests.
- Deliberate shortcuts carry a `// ponytail:` comment naming the ceiling.

## Before closing a change

`pnpm run check` must pass: version sync, typecheck, lint, tests (including the tmux e2e), build, and UI stories.
Update `README.md` when behavior or settings change, in the same change.
Record user-facing changes in `CHANGELOG.md` under `Unreleased`; move them to a dated version section
when preparing that release. Do not describe planned fixes as completed changes.
