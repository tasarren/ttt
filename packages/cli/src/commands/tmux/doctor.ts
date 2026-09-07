import { access } from "node:fs/promises"

import { CheckState, MIN_TMUX_VERSION, OptionScope, PROFILES, UserOption } from "@ttt/tmux"
import type { OptionCheck } from "@ttt/tmux"

import { parseCommandArgs } from "../../args.ts"
import { CliError, usageError } from "../../cli-error.ts"
import { readSessionRecord } from "../../session-record.ts"
import { SkillState, skillInstalls } from "../../skill-status.ts"
import type { TmuxVerb, TmuxVerbContext } from "../../tmux-context.ts"

const DOCTOR_OPTIONS = { json: { type: "boolean", default: false }, strict: { type: "boolean", default: false } } as const

export const Severity = { Ok: "ok", Warn: "warn", Fail: "fail" } as const
export type Severity = (typeof Severity)[keyof typeof Severity]

export interface Finding {
  severity: Severity
  subject: string
  detail: string
  fix?: string
}

/** `ttt tmux doctor [--json] [--strict]`: read-only checks; `--strict` exits 1 on any warning. */
export const doctor: TmuxVerb = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, DOCTOR_OPTIONS)
  if (positionals.length > 0) throw usageError("usage: ttt tmux doctor [--json] [--strict]")
  if (ctx.session === undefined) throw usageError("not inside tmux; pass --session NAME before the command")
  const findings = await diagnose(ctx, ctx.session)
  if (values.json) process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`)
  else process.stdout.write(findings.map(formatFinding).join("\n") + "\n")
  const worst = findings.some((finding) => finding.severity === Severity.Fail) ? Severity.Fail
    : findings.some((finding) => finding.severity === Severity.Warn) ? Severity.Warn : Severity.Ok
  if (worst === Severity.Fail || (values.strict && worst === Severity.Warn)) throw new CliError(`doctor found problems in ${ctx.session}`)
}

async function diagnose(ctx: TmuxVerbContext, session: string): Promise<Finding[]> {
  const findings: Finding[] = []
  const info = (await ctx.tmux.inventory.serverInfo())
  findings.push({ severity: Severity.Ok, subject: "tmux", detail: `${info.version} on ${info.socketPath}${info.configFiles ? `, config ${info.configFiles}` : ""} (minimum ${MIN_TMUX_VERSION.join(".")})` })

  const tree = await ctx.tmux.inventory.tree(session)
  if (!tree.attached) findings.push({ severity: Severity.Warn, subject: "clients", detail: "no client attached; popups and status redraws wait for an attach", fix: `tmux attach -t ${session}` })
  if (tree.group !== undefined) findings.push({ severity: Severity.Warn, subject: "session group", detail: `session belongs to group ${tree.group}; grouped panes list under the original session only, which confuses identity` })

  const profileName = await ctx.tmux.options.get({ scope: OptionScope.Session, target: session, key: UserOption.Setup })
  const record = await readSessionRecord(ctx.settings.home, session)
  if (profileName === undefined) {
    findings.push({ severity: Severity.Warn, subject: "setup", detail: "session was not set up by ttt", fix: `ttt tmux setup --name ${session} (new session) or run inside one created by setup` })
    return findings
  }
  const profile = PROFILES[profileName]
  if (!profile) {
    findings.push({ severity: Severity.Fail, subject: "setup", detail: `session claims profile ${profileName}, which this ttt does not know` })
    return findings
  }
  findings.push({ severity: Severity.Ok, subject: "setup", detail: `profile ${profile.name}${record ? `, recorded ${record.createdAt}` : " (no session record on disk)"}` })

  const report = await ctx.tmux.setup.check(session, profile)
  for (const check of report.checks.filter((row) => row.state === CheckState.Off)) findings.push(offProfile(check))
  if (!report.hookInstalled) findings.push({ severity: Severity.Warn, subject: "hook", detail: "after-new-window hook missing; windows opened by hand are not normalized" })
  if (record) {
    await access(record.hookBin).catch(() => {
      findings.push({ severity: Severity.Fail, subject: "hook", detail: `hook binary ${record.hookBin} no longer exists; new windows silently stay unnormalized`, fix: "recreate the session with ttt tmux setup, or reinstall ttt at that path" })
    })
  }
  for (const line of await ctx.tmux.hooks.failures("_normalize-window")) findings.push({ severity: Severity.Warn, subject: "hook", detail: line.trim() })

  for (const window of tree.windows) {
    const stamped = window.panes.filter((pane) => pane.agent === window.name)
    if (stamped.length === 0) findings.push({ severity: Severity.Ok, subject: `window ${window.name}`, detail: "no stamped pane yet; delivery uses the lowest-index pane until the agent runs ttt" })
    for (const pane of window.panes.filter((candidate) => candidate.dead)) findings.push({ severity: Severity.Warn, subject: `window ${window.name}`, detail: `pane ${pane.pane} is dead`, fix: `ttt tmux respawn ${window.name}` })
    for (const pane of window.panes.filter((candidate) => candidate.historyLimit < Number(profile.options.find((option) => option.key === "history-limit")?.value ?? 0))) {
      findings.push({ severity: Severity.Warn, subject: `window ${window.name}`, detail: `pane ${pane.pane} keeps only ${pane.historyLimit} lines of history` })
    }
  }
  if (tree.windows.length === 0) findings.push({ severity: Severity.Warn, subject: "windows", detail: "session has no windows" })
  findings.push(...await skillFindings(ctx.version))
  return findings
}

/** Read-only: agents need the shipped skill to match the shipped binary. Installing is the installer's job. */
async function skillFindings(binaryVersion: string): Promise<Finding[]> {
  const installs = await skillInstalls()
  const present = installs.filter((install) => install.state !== SkillState.Missing)
  if (present.length === 0) {
    return [{ severity: Severity.Warn, subject: "skill", detail: "no ttt skill installed for any agent", fix: "npx skills add tasarren/ttt (or: npx skills add \"$(npm root -g)/@tasarren/ttt\")" }]
  }
  return present.map((install) => {
    const where = install.state === SkillState.Copy ? "copy" : `symlink -> ${install.target ?? "?"}`
    if (install.state === SkillState.Broken) {
      return { severity: Severity.Warn, subject: `skill ${install.harness}`, detail: `${where} (target missing)`, fix: `remove ${install.path} and reinstall: npx skills add tasarren/ttt` }
    }
    if (install.version === binaryVersion) {
      return { severity: Severity.Ok, subject: `skill ${install.harness}`, detail: `${where}, v${install.version}` }
    }
    return {
      severity: Severity.Warn,
      subject: `skill ${install.harness}`,
      detail: `${where}, ${install.version === undefined ? "unversioned" : `v${install.version}`} but ttt is v${binaryVersion}`,
      fix: install.state === SkillState.Symlink ? "the link target is stale; update the checkout or package it points to" : "npx skills update ttt, or reinstall from the current package",
    }
  })
}

function offProfile(check: OptionCheck): Finding {
  const where = check.scope === OptionScope.Server ? "server" : `${check.scope} ${check.target}`
  return {
    severity: check.mode === "assert" ? Severity.Warn : Severity.Fail,
    subject: `${where} ${check.key}`,
    detail: `is ${check.found ?? "unset"}, wanted ${check.wanted}: ${check.why}`,
    ...(check.mode === "assert" ? {} : { fix: `tmux set-option ${check.scope === OptionScope.Server ? "-s" : check.scope === OptionScope.Window ? `-w -t ${check.target}` : `-t ${check.target}`} ${check.key} ${JSON.stringify(check.wanted)}` }),
  }
}

function formatFinding(finding: Finding): string {
  const mark = finding.severity === Severity.Ok ? "ok  " : finding.severity === Severity.Warn ? "warn" : "FAIL"
  return `${mark} ${finding.subject}: ${finding.detail}${finding.fix ? `\n     fix: ${finding.fix}` : ""}`
}
