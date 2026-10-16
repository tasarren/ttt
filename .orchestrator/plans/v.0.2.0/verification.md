# Release audit and implementation evidence

## Implemented candidate — 2026-10-16

Local candidate version: **0.2.0**. Project refs remain at audit baseline; changes are uncommitted.
The historical audit below is retained as before/after evidence, not the current readiness verdict.

| Gate | Current result | Evidence |
|---|---|---|
| Full working checkout on minimum Node | PASS | Node 24.11.0 / pnpm 11.24.0; 170 tests, zero failed/skipped, all builds and stories |
| Final clean candidate snapshot | PASS | No copied node_modules/build output; frozen pnpm 11.24.0 install, full 170-test check, 66 stories / 176 variants, pack dry-run on Node 24.11.0 |
| Packed CLI on minimum Node | PASS | All 24 existing E2E tests plus real hook-path regression: 25/25, zero skipped |
| Hook quoting | PASS | Real private tmux; copied Node and CLI path with spaces, apostrophes, double quotes, `$HOME`, command substitutions, backticks, semicolon, and literal `#{session_name}`; W-1/options correct, no injected files |
| Release preflight | PASS locally | Test fixture accepts matching tag+commit, rejects wrong/missing-v tag, stale generated version, and tag on another commit; fixture Git refs only |
| Upgrade and rollback | PASS | Published 0.1.3, two boards, external boardRoot, unread/read/acked receipts, ACK note, thread reply, dry-run byte identity, v7, no-op rerun, live re-seating, restored backup + old writer |
| Version | PASS | CLI/generated constant/bundled skill 0.2.0; engines >=24.11.0; registry still latest 0.1.3 and 0.2.0 absent |
| Package boundary | PASS | Exactly five files; built bin; no runtime deps; TypeScript AST checks built-in imports/no dynamic loads; bundler module inventory only CLI/board/tmux/migrations/jsonc-parser |
| Remaining dependency audit | TRIAGED | Two unpatched Histoire-only advisories; see below; no suppression |
| GitHub/OIDC upload | PENDING MAINTAINER | No remote writes; prior 0.1.3 provenance names this repository's release.yml, but current trusted-publisher settings require maintainer confirmation |

Reusable checks: `.orchestrator/scripts/verify-{release,packed,upgrade,candidate}.mjs`.
Source hook and release regression tests run in ordinary `pnpm run check`; CI and release jobs also
run `pnpm run verify:packed`. Both select Node 24.11.0 explicitly, preserving pnpm 11.24.0.
Release staging follows a full check of the tag's exact checkout, rather than relying on old CI runs.

Evidence under `.orchestrator/tmp/release-audit-2026-10-16/`: `candidate-check.log`,
`packed-candidate.log`, `upgrade-candidate.log`, `dependency-audit-final.json`, and
`clean-candidate.log`. Packed module inventory/tarball live in `.orchestrator/tmp/p-C5IUyl/`;
upgrade hashes/backups/result live in `.orchestrator/tmp/upgrade-am5Gp4/`.
Final clean snapshot: `.orchestrator/tmp/c-spLptb/`. Later edits only record these results in docs.

## Dependency triage after implementation

Compatible transitive updates installed `brace-expansion@5.0.12` and `shell-quote@1.12.0`.
The first targeted update left Vue peer-graph edges at `source-map-js@1.2.1`, despite its compatible
`^1.2.1` declaration. A narrow `source-map-js@1.2.1: 1.2.2` override now covers every edge. Remove it
when Vue's compiler minimum excludes 1.2.1 and a frozen install/audit confirms no vulnerable edge.

Final `pnpm audit --json` still exits 1: **one high, one moderate, zero critical**. No ignore list added.

| Advisory | Actual call path / exposure | Release decision and follow-up |
|---|---|---|
| `braces@3.0.3`, high `GHSA-vfj7-8cjw-p6xm` | Histoire `dist/node/stories.js` supplies repository `storyMatch` / `storyIgnored` / support patterns to globby/micromatch; our config uses `stories/src/**/*.story.vue`. Deeply nested hostile patterns can exhaust the tooling process stack. No CLI board/message or web request input feeds these patterns. | Accept for this CLI release with repository-controlled story patterns and loopback Histoire dev host. Do not treat arbitrary imported story configuration as data-only. Track advisory's published patch, update compatible dependency, rerun audit + stories. |
| `sprintf-js@1.0.3`, moderate `GHSA-hp3w-g68c-fv3c` | Dependency chain Histoire → gray-matter → js-yaml → argparse → sprintf-js. gray-matter calls js-yaml `safeLoad` / `safeDump`; js-yaml imports argparse only from `bin/js-yaml.js`, not its library entry. No identified path from story frontmatter to attacker-controlled sprintf precision in normal Histoire library use. | Accept for this CLI release; no patch published. Revisit on upstream patch or any new call to js-yaml CLI/argparse with external format strings. |

This is a scoped reachability decision, not a claim those packages are fixed. Packed AST and module
inventory checks establish that neither dependency, Histoire, Vue, nor the web host enters the CLI.
Experimental web UX is still a separate milestone; initial limited browser evidence below remains
the only browser verification claimed here.

## Original audit baseline

Date: 2026-10-16. Source baseline: `708b5f5` (`next`). Previous release: `c6c2a94` (`v0.1.3`).
Local tools: Node `26.10.0`, pnpm `12.4.2`, Corepack `0.34.6`, tmux `3.7c`.
Compatibility tooling: Corepack pnpm `11.24.0`, official Node `24.11.0` Linux x64.

## Results

| Check | Result | Evidence / limit |
|---|---|---|
| Working checkout `pnpm run check` | PASS | 168 tests, 0 failed/skipped; typecheck/lint/build; 66 stories, 176 variants |
| Clean archived checkout, frozen pnpm 11 install | PASS | No existing node_modules/build output; local package store reused |
| Clean checkout full check on pnpm 11 | PASS | 168 tests, 0 failed/skipped; 66 stories, 176 variants |
| Final working checkout check after script moves | PASS | 168 tests, 0 failed/skipped; all builds; 66 stories, 176 variants |
| Moved version/schema generators | PASS | Version check passes; 30 schema definitions regenerated with no contract diff |
| Lint after orchestrator allowlist | PASS | Workspace lint and explicit lint of both moved generators; scratch stays excluded |
| CLI-only clean pack dry-run | PASS | Builds without first building UI/webapp |
| Actual pack + extract | PASS | Five allowlisted files; 88,137-byte tarball at audit baseline |
| Packed help on Node 24.11.0 | PASS | Main/create/tmux help outside repository without runtime dependencies |
| Full packed CLI E2E on Node 24.11.0 | FAIL | 22/24 passed; batching assertion failed, then leaked mail broke seat test |
| Focused packed group/seat E2E | PASS | 2/2 passed in fresh fixture; does not erase full-suite failure |
| Packed setup normal path vs path with spaces | FAIL | Normal path exit 0 and `W-1`; spaced path exit 1 and unnormalized window |
| Published 0.1.3 to next migration fixture | PASS | Dry-run unchanged; v6 to v7 only changed ledger/removed obsolete registry; thread body survived; rerun no-op |
| Built web HTTP/SSR/SSE smoke | LIMITED | State/assets/SSE returned 200; session/window/pane UI and xterm input rendered; no console errors |
| Built web action smoke | UNPROVEN | Selecting Shell and clicking New window did not produce observed POST or new window; needs isolated reproduction |
| Registry release availability | BLOCKED | Package still `0.1.3`, already published; no version bump performed |
| CI/release workflow readiness | BLOCKED | Both setup-node steps refer to deleted `.node-version` |
| Dependency audit | NEEDS TRIAGE | 7 advisories: critical 1, high 4, moderate 2 |
| Git whitespace | PASS at baseline | `git diff --check` |

The original packed suite uses one shared board across tests. At
`packages/cli/tests/e2e.test.ts:203`, it expected `notify in ~1s`, but got valid
`joins pending batch`. Early assertion exit left `group probe` unread in B. Seat test
line 251 then received two messages instead of its expected single `A-2` message.
The focused tests passed; the full-suite failure remains a reliability gate, not proof
that packed identity or group routing is broken.

Setup-hook issue is independent and reproducible with identical binaries. At
`packages/cli/src/commands/tmux/setup.ts:141`, command becomes:

```text
run-shell "/path/to/node /path with spaces/ttt.mjs tmux _normalize-window #{window_id}"
```

The shell splits the binary pathname. Real `tmux new-window` exits 1 and leaves its window
unnormalized. Quoting must protect both executable paths through tmux and shell parsing.

## Package boundary

Audited tarball contains exactly:

```text
package/LICENSE
package/package.json
package/README.md
package/skills/ttt/SKILL.md
package/dist/ttt.mjs
```

`publishConfig.bin` correctly rewrites to `./dist/ttt.mjs`; `dependencies` is empty.
Bundle static imports resolve only Node built-ins. `tsdown.config.ts` has one entry,
`src/ttt.ts`, bundling board/migrations/tmux/jsonc-parser. `main.ts` does not import the
separate web host. Webapp/UI remain private checkout dependencies; no `ttt web` command exists.
Current packed metadata lacks the Node engine range documented by README and published `0.1.3`.

## Upgrade evidence

Downloaded registry `0.1.3` tarball; verified registry SHA-1
`4c33c6f3465a80fd988e7fd005f696dd9b8bea90`. Sent a real message through old CLI in a private
tmux session, migrated old board to v6, and seeded obsolete `state/panes.json`.
Next's dry-run preserved JSON file hashes. Real migration changed only `state/schema.json`
and removed `state/panes.json`; message/thread content survived and second migration was a no-op.
Old CLI could still read that particular thread after migration; no mixed-version or downgrade
guarantee follows. Broader receipt fixtures and backup restoration remain release tasks.

Node `24.11.0` download verified against official SHA-256:
`46da9a098973ab7ba4fca76945581ecb2eaf468de347173897044382f10e0a0a`.

## Dependency findings

`pnpm audit --json`, 2026-10-16; full JSON saved in ignored audit directory.

| Dependency | Locked version | Severity / advisory | Available fix / path |
|---|---|---|---|
| brace-expansion | 5.0.9 | moderate `GHSA-q2hr-2g5m-vwhr`; high `GHSA-qhr7-859c-m2p7`, `GHSA-6j4f-fj2g-mc7p` | >=5.0.12 covers all three; ESLint/minimatch tooling |
| braces | 3.0.3 | high `GHSA-vfj7-8cjw-p6xm` | No published patch reported; Histoire/globby/micromatch |
| sprintf-js | 1.0.3 | moderate `GHSA-hp3w-g68c-fv3c` | No published patch reported; Histoire/gray-matter/js-yaml/argparse |
| source-map-js | 1.2.1 | high `GHSA-68fv-2mgg-jv7q` | >=1.2.2; Vue/Vite/PostCSS; includes webapp runtime dependency graph |
| shell-quote | 1.10.0 | critical `GHSA-pqg4-j6r4-53mv` | >=1.11.0; Histoire Vue plugin/launch-editor |

These dependency findings are not the CLI setup-hook bug; that hook uses its own string
construction. Do not conflate package audit severity with established CLI exploitability.

`gh pr list --repo tasarren/ttt --state open` returned `[]`. All ten historical PRs were
human-authored and merged; no Dependabot/Renovate config exists. Repository API reports
Dependabot security updates disabled; alerts endpoint returns 403 saying alerts are disabled,
so no claim is made about a reviewed/empty security-alert inbox. Notification-source investigation
found another repository; user explicitly excluded it from scope. No bot/settings changes made.

## Git and release facts

- `git ls-remote` agreed with local main/next refs at audit time; main is an ancestor, 57 commits behind next.
- Baseline main-to-next diff: 281 files, +23,642 / -749 lines. This warrants a milestone release.
- Existing GitHub CI history is main/release evidence; push CI targets main, not next.
- GitHub Release `published` triggers staging; prereleases are skipped. Stage approval is separate.
- Release job does not currently run the full check or version-sync check before staging.
- npm latest is `0.1.3`; tags/GitHub releases exist for `0.1.0`, `0.1.2`, `0.1.3`.
  npm time metadata records `0.1.1`, but direct version lookup now fails. Changelog states this.

## Local evidence paths

All audit artifacts were moved from the initial temporary location into
`.orchestrator/tmp/release-audit-2026-10-16/` per the requested workspace rule. Older logs and
adapted test fixtures still contain their original absolute paths; regenerate fixtures before
rerunning them. No temp-path aliases were left behind.

- `ttt-next-release-check.log`: initial full workspace check.
- `ttt-next-release-install.log`, `ttt-next-release-clean-check.log`: clean checkout pnpm 11 evidence.
- `ttt-next-release-pack-dry.log`, `ttt-next-release-pack.log`: packaging output.
- `ttt-next-release-packed-e2e.log`, `ttt-next-release-packed-focused.log`: failing full suite and focused pass.
- `dependency-audit.json`: current registry advisories.
- `final-check.log`: full check after changelog/rules/script-location changes.
- `checkout/`, `packed/`, `published/`, `upgrade-home/`, `path with spaces/`: disposable artifacts.

Owned browser tab, web host, and private smoke-test tmux servers were closed after verification.
User sessions/boards were not used for smoke tests. No remote writes or history rewrite performed.
