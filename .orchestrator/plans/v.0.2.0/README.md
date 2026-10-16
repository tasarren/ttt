# v0.2.0 release roadmap

Audit date: 2026-10-16. Target: **`@tasarren/ttt@0.2.0`**, PR **`next` into `main`**.
Status: **local and GitHub Docker matrices green; required-check aggregation awaiting verification**.
Node 24.11.0 / pnpm 11.24.0 on tmux 3.2, 3.4, and 3.8: 173 source tests and 25 packed tests pass
per version, with zero failures/skips and 66 stories / 176 variants. Upgrade/backup rollback passes.
PR [#11](https://github.com/tasarren/ttt/pull/11) contains release-preparation commit `c6437fd`
and compatibility follow-up `08f76f8`. GitHub run `38956199129` passed all three matrix jobs.
Branch protection requires `check`; the aggregate job preserves that name and requires every
matrix job to succeed. Its follow-up run must pass before merge.
First GitHub run exposed tmux fixture assumptions and incorrect pane-index option scope; follow-up
fix and verification are recorded in `verification.md`. Green CI, merge, trusted-publisher
confirmation, tagging, staging, and approval remain release gates.

## Decision

- Release the CLI milestone as `0.2.0`: substantial new commands, pane ownership changes,
  schema v7, and changed urgent delivery justify a pre-1.0 minor release.
- Keep the webapp in the repository as an explicitly experimental, checkout-only preview.
  Its packages are private and the npm CLI bundle excludes it. UI completion need not hold
  the CLI release, but the full workspace must still pass `pnpm run check`.
- Preserve `next` history. Do not rebase merely to remove the webapp: `main` is already an
  ancestor, and UI-era commits also change shared CLI/tmux behavior.
- Initial audit was read-only remotely. After authorization, release prep was committed and pushed
  to `next`, and PR #11 opened. No tags, publication, or remote settings changes performed.

## Context and artifacts

| Artifact | Purpose |
|---|---|
| `.orchestrator/plans/v.0.2.0/README.md` | Decisions, ordered work, acceptance criteria, release runbook |
| `.orchestrator/plans/v.0.2.0/verification.md` | Audit evidence, failures, limits, and dependency findings |
| `CHANGELOG.md` | Full release history plus unreleased user-facing work and upgrade notes |
| `.orchestrator/scripts/` | Reusable scripts; existing verification/version/schema scripts moved here |
| `.orchestrator/tmp/release-audit-2026-10-16/` | Ignored local logs, clean checkout, tarballs, runtime, fixtures |

Read `AGENTS.md` and `docs/development.md` before implementation. The audit loaded code-search,
tmux, browser, code-clarity, TypeScript/package/toolchain, testing, and project-structure guidance.
Stale memory-wiki references to workflow/research-to-plan were unavailable; available coding
companions supplied the applicable guidance.

## 1. Repair CI and release preflight — blocker

Files: `.github/workflows/ci.yml`, `.github/workflows/release.yml`,
`.orchestrator/scripts/` for reusable preflight logic.

- [x] Replace `node-version-file: .node-version` in both workflows. Commit `708b5f5` deleted
  that file. Select Node explicitly in CI; use a supported Node 24 version at least `24.11.0`,
  or document a newer build runtime while retaining a Node `24.11.0` packed-runtime check.
- [x] Keep the existing CI pnpm `11.24.0` selection unless an independently verified tooling
  update is required. Clean install and full check already passed with that pnpm version.
- [x] Add a release preflight on the exact release commit: version consistency, tag/version
  match, and full checks. Release verification now reuses the CI Docker matrix before staging.
- [x] Put reusable release validation in `.orchestrator/scripts/`, replacing the inline
  `node -e` guard when extending it. A script must reject mismatched tags and versions.
- [ ] Confirm OIDC trusted publisher still permits this repository/workflow/environment and
  staged publishing. Audit used read-only metadata; it did not exercise OIDC upload/approval.
  Prior 0.1.3 provenance confirms `tasarren/ttt` / `.github/workflows/release.yml`; this is historical
  evidence, not confirmation of today's package publisher settings. No npm token added.

**Acceptance:** clean runner resolves Node without deleted files, frozen install works,
all checks run on the candidate SHA, wrong tag/version fails before staging, prereleases
remain excluded, and no long-lived npm token is introduced.

## 2. Fix setup-hook quoting and packed test reliability — blocker

Files: `packages/cli/src/commands/tmux/setup.ts:140`,
`packages/cli/tests/e2e.test.ts:195`, tmux setup/hook tests as needed.

- [x] Quote executable paths correctly through both tmux's command parser and `run-shell`'s
  shell parser. Baseline hook interpolated `process.execPath` and `ctx.binPath` unquoted
  inside a single shell command. Spaces break normalization; shell metacharacters must
  remain literal too. Preserve deliberate `#{window_id}` format expansion.
- [x] Add one real private-tmux regression covering packed CLI paths containing spaces and
  apostrophes, and a Node executable path containing spaces. Assert new-window succeeds,
  gets the expected `W-N` name/options, and does not execute path text as shell syntax.
- [x] Fix the group-thread E2E's timing-dependent notification assertion. Both a new batch
  and joining an existing batch are valid; assert routing and thread semantics independently
  of incidental timer state. Parenthesize alternatives in the widened-reply assertion too.
- [x] Keep fixture cleanup deterministic on assertion failure so unread group mail cannot
  cascade into the following seat-routing test. Do not add sleeps to mask the failure.
- [x] Make packed CLI testing reusable in `.orchestrator/scripts/`, using the existing E2E
  coverage rather than cloning a second permanent suite. Use `.orchestrator/tmp/` for pack,
  extraction, test homes, and logs. Keep test fixtures scoped to their private tmux server.

**Acceptance:** full 24-test CLI suite passes against the extracted tarball on Node `24.11.0`,
including normal/urgent/wait/cancel/GUI-seat/create/setup behavior; the path regression passes.
Source-suite success alone is insufficient: the original packed suite failed 2 of 24 tests.

## 3. Resolve dependency findings — release triage gate

Files: `pnpm-lock.yaml`, `pnpm-workspace.yaml` only if catalog constraints need changes.

- [x] Refresh compatible transitive versions for `brace-expansion` (at least `5.0.12`),
  `source-map-js` (at least `1.2.2`), and `shell-quote` (at least `1.11.0`). Prefer lockfile
  updates satisfying existing ranges over new dependencies or broad major upgrades.
- [x] Review `braces` and `sprintf-js`: registry audit reports no published patched version.
  Record affected Histoire call paths, exposure, mitigation or upstream follow-up, and release
  decision. Do not suppress advisories to manufacture a clean report.
- [x] Re-run `pnpm audit --json` and the full check after dependency changes; clean frozen install
  is covered by the candidate gate below.
  Separate checkout tooling/webapp exposure from bundled CLI code; empty runtime dependencies
  alone do not prove a bundle contains no vulnerable code.

**Acceptance:** fixed-version advisories are resolved, unresolved advisories have explicit
reachability/impact decisions, and packed CLI dependencies/bundled code are inspected.
The audit found zero open PRs in `tasarren/ttt`; there is no Dependabot backlog to merge or close.
Do not add a bot configuration to solve notification noise from a different repository.

## 4. Finalize version, package metadata, and docs

- [x] Set `packages/cli/package.json` to `0.2.0`, then run `pnpm run version:sync`.
  Generated `packages/cli/src/version.ts` and `skills/ttt/SKILL.md` must match. Keep private
  workspace versions independent; do not publish `@tasarren/tmux` as part of this release.
- [x] Restore an accurate supported runtime range in CLI package metadata (`engines.node`
  at least `>=24.11.0` if the minimum-runtime gate stays green). This is consumer metadata,
  not a return to exact local runtime pins.
- [x] Introduce root `CHANGELOG.md` with all prior versions and current unreleased changes.
- [x] Move completed entries into `0.2.0`, dated 2026-10-16 as **local preparation, pending publication**;
  create fresh `Unreleased` and version comparison links. Update publication date/status when shipped.
- [x] Mark root README webapp section experimental and excluded from the npm package.
- [x] Update `docs/webapp-data-handoff.md:29`: baseline said no API/event stream exists,
  despite `web.ts`, `Board.observe`, SSE, and `packages/webapp/openapi.json`.
- [x] Review older live verification scripts against final CLI output. `verify-seats.sh`
  now asserts urgent summaries and body absence; `verify-teammate-flow.sh` expects `name:`.
  Cleanup targets only created windows; wait checks resolve configured board path and keep history.
  Shell syntax checked; equivalent behavioral paths pass private-server E2E. Live user sessions untouched.
- [x] Add reusable-script, scratch-directory, and changelog rules to `AGENTS.md`; move existing
  maintenance scripts to `.orchestrator/scripts/` and update command references.

**Acceptance:** version sync passes, registry confirms `0.2.0` is unused, README/changelog/skill
agree with the candidate artifact, generator output is unchanged by its move, and docs make
no promises of an npm-installed webapp.

## 5. Candidate verification and upgrade rehearsal

Perform in a fresh checkout/snapshot under `.orchestrator/tmp/` after tasks 1–4:

```sh
corepack pnpm@11.24.0 install --frozen-lockfile
corepack pnpm@11.24.0 run check
corepack pnpm@11.24.0 --filter @tasarren/ttt pack --dry-run
corepack pnpm@11.24.0 --filter @tasarren/ttt pack --pack-destination "$PWD/.orchestrator/tmp"
git diff --check
```

Reusable equivalent: `node .orchestrator/scripts/verify-candidate.mjs /absolute/path/to/node`.
It copies current tracked/unignored files into ignored scratch without creating project refs,
then runs frozen install, full check, and pack dry-run. `pnpm run verify:packed [NODE]` validates
and tests a real tarball; `verify-upgrade.mjs CANDIDATE_BIN [NODE]` exercises upgrade and rollback.

For CI parity without host toolchain changes, prefer
`sh .orchestrator/scripts/verify-container.sh`: the same full-check/packed-test container runs
against tmux 3.2, 3.4, and 3.8 locally and in GitHub Actions. Pass one version to reproduce one job.
Source archives are checksum-verified; host files/configs are not mounted into the container.

- [x] Check tarball allowlist: `dist/ttt.mjs`, `package.json`, `README.md`, `LICENSE`, and
  `skills/ttt/SKILL.md`. If adding the changelog to the tarball, update prepack/postpack/files
  and the expected manifest together; current README uses a repository URL instead.
- [x] Assert published bin maps to `./dist/ttt.mjs`; no `workspace:` runtime dependencies,
  source `.ts` bin, private UI/web assets, or undeclared external imports leak into runtime.
- [x] Run packed help and the complete packed CLI E2E on the documented minimum Node version,
  from the extracted tarball with no runtime dependency imports. Scratch is inside the checkout
  per workspace rules; AST and module-inventory assertions reject dependency resolution leaks.
- [x] Rehearse upgrade from registry `0.1.3`: send/read/ACK/thread fixtures, `--dry-run --all`
  leaves files byte-identical, migration reaches v7, rerun is a no-op, history/receipts survive,
  and panes re-register correctly. Audit already proved a smaller single-session fixture.
- [x] Rehearse rollback using a copy of the pre-upgrade board/settings/session backup with the
  old binary. Do not point the old writer at the migrated live board as a rollback strategy.
- [x] Finish final clean-snapshot frozen install / full check / pack dry-run on Node 24.11.0:
  170 tests, zero failures/skips; 66 stories / 176 variants. See `verification.md` for evidence.
- [x] Verify CI follow-up in isolated Docker Compose containers on tmux 3.2, 3.4, and 3.8:
  each passes the full 173-test workspace check, 25 packed tests, and 66 stories / 176 variants.

**Acceptance:** green full check, green packed suite and hook-path regression, clean manifest,
verified migration/backup restoration, and all unresolved findings listed in release notes.

## 6. Git and PR strategy

Observed refs: `main` / `origin/main` / `v0.1.3` =
`c6c2a946a8a6f06a029b1b7afd06fe2eaaa14215`; `next` / `origin/next` =
`708b5f54a6f457e23ebda85622adfb191038c303`. `main...next` is **0 behind / 57 ahead**.

Recommended sequence when implementation is authorized:

1. Make the scoped fixes above on `next` (or a local release branch based on it).
2. Refresh remote refs before opening the PR; reassess divergence if `main` moved.
3. Open `next` into `main` with changelog, upgrade instructions, and exact verification SHA.
4. Prefer a normal merge preserving ancestry for this long-lived branch. If using squash,
   merge resulting `main` back into `next` afterward so future PRs have a common history.
5. Keep release publication separate from PR merge; merging does not stage npm publication.

Rebase onto current `main` provides no cleanup: it is already an ancestor. Interactive dropping
of UI commits is risky: `61ef5fb` adds shared schemas/save/harness work; `a93c885` mixes create/setup,
GUI seats, and web protocol; CLI fixes `418a904`, `7b8333d`, `51b62f6`, and `0b95175` follow UI work.

If webapp source must be absent from `main`, first decide that explicit scope change. Use a local
release worktree under `.orchestrator/tmp/` and a reviewable removal patch covering workspace
manifests, catalogs/lockfile, imports, tests, CI/story scripts, and docs. Run every gate again.
That becomes a release-branch PR rather than the requested unmodified `next`-to-`main` PR.
Do not force-push shared `next` or reset it to pre-UI `8bb982b`; both discard coupled improvements.

## 7. Publication runbook — future remote actions

1. Confirm merged candidate SHA is green, package version is unused, and changelog is finalized.
2. Create `v0.2.0` at that exact SHA and publish a **non-prerelease GitHub Release** targeting it.
3. Release workflow validates and stages `@tasarren/ttt`; a bare tag push does not publish.
4. Review the resulting npm stage and approve it through npm's staged-publishing flow.
5. Verify registry version, dist-tag, provenance, installability, `ttt --help`, and bundled skill.
6. If a defect appears after publication, stop rollout and publish a new patch version after
   fixing it; pair binary rollback with the saved pre-migration data when needed.

No step in this section was executed during the audit.

## Webapp follow-up — separate stable-web milestone

- [ ] Browser-tested action flows: create shell window/pane, close confirmation/cancel,
  rename, respawn/interrupt, and layout save/restore; assert resulting tmux state.
- [ ] Browser-tested terminal input/output, UTF-8 boundaries, hidden/offscreen pauses,
  reconnect, selection/scrollback, resizing, and no terminal recreation on state refresh.
- [ ] Browser-tested read-only history across filters/pagination: board files and receipts
  unchanged; dirty JSONC survives refresh, route-discard confirmation works, ETag conflict is clear.
- [ ] Keyboard/focus/error/empty-state pass and layout checks at desktop/narrow widths.
- [ ] Resolve native prompt/confirm workflow coverage, loading/error presentation, and any
  dead actions discovered by actual browser tests. Audit did not establish New window success.
- [ ] Decide distribution only after those gates: current host resolves built web assets from
  the checkout. Do not advertise `ttt web` or npm-installed UI before packaging exists.

This milestone needs its own scope/version decision; it is not an excuse to skip workspace CI.
