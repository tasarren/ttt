# Changelog

User-facing history for `@tasarren/ttt`. Published dates come from GitHub/npm records;
the `0.2.0` date records local release preparation, pending publication.

## [Unreleased]

## [0.2.0] - 2026-10-16

Prepared locally; not yet published. Release evidence and remaining maintainer steps:
[roadmap](.orchestrator/plans/v.0.2.0/README.md).

### Added

- `ttt create --window NAME|auto` and `ttt create --pane [NAME]`: registered shell,
  harness, or custom-command teammates; cwd, split sizing, generated names, and readiness checks.
- `ttt tmux setup`: named sessions, interactive setup wizard, agents profile, session records,
  and an `after-new-window` normalization hook.
- `ttt tmux doctor` and `ttt tmux tree`, including JSON output; `ttt panes` inventory with
  agent seats and JSON output. Doctor checks options, hooks, seats, harnesses, and skill installs.
- JSONC layouts: `setup --layout`, `save`, `restore`, and `layouts`; preserve nested tmux geometry,
  working directories, agent names, pane harnesses, helper titles, and recorded commands.
- Tmux controls: close windows or panes, rename, respawn, type, press, interrupt, screen-pattern
  wait, popup, and flash. Driving commands accept agent names, `WINDOW.N`, or pane IDs where supported.
- Blocking `--wait` on send, reply, broadcast, and read; timeouts, signal cleanup, mutual-wait
  refusal, and direct delivery without pasting into a waiting agent's pane.
- Empty `read --wait` calls ramp toward `wait.maxSeconds`; `wait.maxIdle` stops repeated idle
  waits. New mail resets the ramp. Explicit timeouts bypass the ramp.
- `ttt cancel MESSAGE_ID` and `ttt cancel --replace KEY`: retract the sender's unread messages,
  preserve history, and report recipients whose receipts cannot be cancelled.
- `read --gui` marks GUI-owned seats so batched and urgent notifications do not paste into
  a console without a reader; messages remain available through reads.
- Window unread badges via `@ttt_unread`, controlled by `tmux.badges`.
- Operator-declared harnesses with one default, per-pane harness metadata, and configurable
  readiness patterns. Shell teammates need no harness.
- Copyable agent skill included in the CLI tarball; generated CLI/skill version consistency check.
- Root changelog and versioned release roadmap; reusable scripts under `.orchestrator/scripts/`
  and ignored audit/scratch files under `.orchestrator/tmp/`.
- Shared local/CI Docker Compose verification with isolated tmux `3.2`, `3.4`, and `3.8` builds,
  checksum-verified sources, frozen dependencies, full workspace and packed CLI checks.
  Release staging depends on the same matrix; host installs and config mounts are unnecessary.

### Changed

- Pane ownership lives in tmux `@ttt_agent` stamps instead of board `state/panes.json`.
  Each pane can own a separate agent name; second panes get collision-safe `WINDOW-N` names.
- Unstamped windows remain reachable through their first pane. Hand-created scratch windows
  receive `W-N` names; `broadcast --all` skips scratch windows and reaches main agents only.
- `--urgent` now pastes a notification summary, not the message body. Reading still owns
  delivery of the body and the unread-to-read transition.
- Notification pastes wait for screen quiet; quiet waiting happens outside the mailbox lock.
- `create` and `tmux` have board-free command contexts and help that works without settings
  or a live tmux session. Setup accepts `--non-interactive`.
- Saved layouts use recorded commands or process-tree launch arguments; idle shells save as
  `null`, inferred commands carry source/warning information, and the saver process is excluded.
- ACK notes that answer a reply-expected message emit guidance to use `reply`; ACK still
  updates receipts only. Output examples quote message bodies for shell use.
- CI owns toolchain selection instead of exact local Node/pnpm pins.
- CI and release checks use Node `24.11.0` / pnpm `11.24.0`; release staging verifies the
  exact tag/commit, full workspace, tarball boundary, and packed CLI behavior first.

### Fixed

- Apply `pane-base-index` per window, including windows created after setup; user tmux config
  no longer masks inconsistent pane numbering in verification. Test first-pane history against
  actual tmux state because versions before 3.7 retain creation-time history limits.
- Keep tmux machine output in UTF-8 even under the C locale; tmux 3.2 otherwise replaces field
  separators with underscores, breaking inventory and session/window creation.
- Allow `ttt tmux doctor` on detached older tmux servers whose message log requires an attached
  client; other server errors still propagate.
- Expand home directories in pane borders through tmux's native `#{HOME}` format, avoiding
  tmux 3.4's escaped-dollar option values and false doctor mismatches.
- Read tmux 3.8 layouts through its native legacy control query without attaching a client;
  nested geometry stays compatible with existing saved layouts. Floating panes are refused
  because the legacy layout format cannot preserve them.
- Reject pastes to already-dead panes before allocating a buffer; tmux 3.2 can crash its server
  if `paste-buffer` reaches a dead pane. Real tests assert the server survives rejection.
- Await identity stamps before short-lived CLI commands exit.
- Preserve pane ownership and prevent a second pane from taking the main agent's name.
- Refuse renames that would orphan an existing mailbox or inherit another agent's old mailbox.
- Recheck mailbox state and wait presence before notification delivery; do not paste into
  agents already waiting for that message.
- Keep urgent message bodies unread until an explicit read; preserve notification fallback.
- Validate creation choices and name collisions before changing tmux; readiness timeouts leave
  the newly created teammate available for inspection.
- Quote setup-hook executable paths through tmux and shell parsing, preserving spaces,
  apostrophes, shell metacharacters, and literal tmux formats.
- Remove timing-dependent group-thread test assertions and clean up unread mail after failures.
- Restore published `engines.node: >=24.11.0` metadata and replace deleted CI runtime-file references.
- Update `brace-expansion` to `5.0.12`, `shell-quote` to `1.12.0`, and all `source-map-js` paths to
  `1.2.2`; keep a narrow override until Vue's compiler minimum excludes the vulnerable patch.
- Align live checks with summary-only urgent delivery and `whoami` identity output; cleanup
  closes only windows created by the check and preserves board history.

### Known tooling findings

- Histoire still depends on unpatched `braces` (`GHSA-vfj7-8cjw-p6xm`, high) and `sprintf-js`
  (`GHSA-hp3w-g68c-fv3c`, moderate). Neither enters the published CLI bundle. Story glob patterns
  are repository-controlled; the affected `sprintf-js` path belongs to js-yaml's CLI rather than
  Histoire's YAML library calls. Audit remains nonzero; see
  [reachability and follow-up](.orchestrator/plans/v.0.2.0/verification.md#dependency-triage-after-implementation).

### Experimental checkout-only webapp

- Private Vue UI library with contract types, Histoire stories, and page previews.
- Localhost Hono/Vue SSR host with Pinia, routing, OpenAPI contract, and SSE invalidations.
- Board/thread/receipt views, agent waits, sessions, layouts, activity, projects, diagnostics,
  and settings; paged history and observational reads that do not change receipts or expiry.
- Live xterm panes through tmux control mode, input guards, session overview, pane text-size
  controls, and streams paused for collapsed/offscreen/hidden views.
- Terminal instances survive metadata refresh and geometry changes.
- Settings/layout JSONC editing preserves comments and checks ETags before atomic saves.
- Webapp and UI packages remain private. Neither is included in the published CLI artifact;
  browser workflow stabilization remains tracked in the release roadmap.

### Upgrade notes

1. Back up the configured `TTT_HOME` and any separately configured `boardRoot`; stop old notifier
   and wait processes before switching versions.
2. Run `ttt migrate --dry-run --all`, inspect the output, then run `ttt migrate --all`.
   Supply the normal `--session SESSION --from NAME` overrides when running outside tmux.
3. Schema v7 removes the obsolete pane registry. Run `ttt whoami` in agent panes to establish
   their live tmux seats. Messages and receipt history stay in place.
4. Scripts following intermediate `next` builds must replace `ttt tmux open`/`split` with
   `ttt create`. Those intermediate commands were never part of published `0.1.3`.
5. Consumers of receipt state must handle `cancelled`. Layouts from intermediate builds must
   put `harness` on panes, not windows. Update urgent-message expectations to summary-only.

Downgrade is not an inverse migration: restore the pre-upgrade data backup together with the old
binary if rollback is needed. A successful old-binary read does not establish downgrade compatibility.

## [0.1.3] - 2026-09-04

### Added

- `ttt whoami` reports session, window, pane, and identity-resolution method.
- Group replies via `reply --to thread`; thread output includes resolved topics and participants.
- Read/ACK actor attribution, including recovery overrides shown in message status.
- Agent-pane registration and routing so notifications and captures use the agent's pane rather
  than whichever pane happens to be active.

### Changed

- Identity detection walks process ancestry instead of trusting the active tmux window;
  overrides must select session and sender together.
- Capture removes TUI borders, spinners, and other chrome unless `--raw` is requested.
- Default notification batching shortened from 60 to 20 seconds.
- Thread and inbox output includes reply guidance and clearer partial-read summaries.

### Fixed

- Clean up stale pane bindings and temporary board files; preserve atomic sequence-ordered reads.
- Tighten capture validation and integration coverage for pane routing, duplicate names,
  group threads, and override auditing.

## [0.1.2] - 2026-09-04

### Fixed

- Make the published bundle installable: bundled workspace packages and `jsonc-parser` move
  to development dependencies; published runtime dependencies are empty.
- Fix shell quoting in the release tag/version guard.

### Changed

- Use npm staged publishing through the OIDC trusted publisher. CI uploads a stage;
  a maintainer approves publication separately.

## [0.1.1] - 2026-09-04

### Changed

- Version-only release attempt after `0.1.0`, recorded by PR #5 and npm publication history.
  No matching Git tag or GitHub release exists; the version is no longer retrievable from
  the registry as of 2026-10-16. Packaging correction followed in `0.1.2`.

## [0.1.0] - 2026-09-04

### Added

- Initial durable, file-backed messaging for teammates in one tmux session: send, shorthand
  addressing, broadcast, reply, read/peek/latest, ACK, inbox, status, and thread history.
- Per-recipient receipts, atomic writes, mailbox locks, sequence ordering, and honest
  queued/notified/read/acked status output.
- Batched notifications with heartbeat/retry handling and immediate urgent delivery.
- Non-destructive triage, batch ACK, compact timestamps, sender filters, and thread subjects.
- Replacement keys and expiring messages; prune with dry-run, thread indexes, unread indexes,
  and rerunnable schema migrations through v6.
- Window inventory with duplicate-name warnings; capture with line limits, substring filters,
  contextual matching, and raw output.
- Strict JSONC settings, per-window batching overrides, recovery identity overrides,
  and configurable board home and tmux timing.
- Self-contained ESM CLI bundle, copyable agent skill, agent prompt, and developer guide.
- Full workspace CI with real tmux tests; GitHub Release-gated OIDC publishing with
  detached-HEAD support. A bare tag push does not publish a package.

[Unreleased]: https://github.com/tasarren/ttt/compare/v0.2.0...next
[0.2.0]: https://github.com/tasarren/ttt/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/tasarren/ttt/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/tasarren/ttt/compare/25cd5a1...v0.1.2
[0.1.1]: https://github.com/tasarren/ttt/pull/5
[0.1.0]: https://github.com/tasarren/ttt/releases/tag/v0.1.0
