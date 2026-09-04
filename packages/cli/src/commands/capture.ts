import { resolveAgentPane } from "@ttt/tmux"

import { boundedInt, parseCommandArgs } from "../args.ts"
import { usageError } from "../cli-error.ts"
import { requireWindow } from "../context.ts"
import type { Handler } from "../context.ts"

const CAPTURE_OPTIONS = {
  lines: { type: "string" },
  raw: { type: "boolean", default: false },
  grep: { type: "string" },
  around: { type: "string" },
  context: { type: "string" },
} as const

/** `capture TARGET [--lines N] [--raw] [--grep PATTERN] [--around PATTERN] [--context N]`.
 * Without `--raw`, TUI chrome (borders, spinners, padding) is cleaned first. */
export const capture: Handler = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, CAPTURE_OPTIONS)
  const [target, ...extra] = positionals
  if (target === undefined || extra.length > 0) {
    throw usageError("usage: ttt capture TARGET [--lines COUNT] [--raw] [--grep PATTERN] [--around PATTERN] [--context COUNT]")
  }
  if (values.grep !== undefined && values.around !== undefined) {
    throw usageError("--grep and --around cannot be combined")
  }
  const lines = boundedInt(values.lines, "--lines", ctx.settings.capture.lines, ctx.settings.capture.maxLines)
  const window = await requireWindow(ctx, target)
  // Same pane truth as notify delivery: the agent's pane, never the window's
  // active pane (which is whoever touched it last). Dead bindings are pruned.
  const live = await ctx.tmux.listAllPanes().catch(() => [])
  const binding = await ctx.board.resolvePane(target)
  const hit = binding && live.some((pane) => pane.pane === binding.paneId && pane.windowId === binding.windowId)
  if (binding && !hit) await ctx.board.prunePane(target)
  const raw = await ctx.tmux.capture(resolveAgentPane(live, window.id, hit ? binding : undefined), lines, !values.raw)
  const text = values.raw ? raw : normalizePane(raw)
  if (values.around !== undefined) {
    const context = boundedInt(values.context, "--context", 3, ctx.settings.capture.maxLines)
    process.stdout.write(filterAround(text, values.around, context))
    return
  }
  process.stdout.write(filterLines(text, values.grep))
}

/**
 * Strips TUI chrome from captured pane text so agents read content, not harness
 * drawings. Rules, in order per line: drop control chars (except tab), drop
 * braille spinners, shave edge runs of borders/padding that carry a border glyph,
 * drop lines left with nothing but border glyphs, squeeze blank runs to one.
 * Pure-ASCII lines are never dropped and indentation is kept, so message bodies,
 * tables, and code survive byte-identical.
 */
export function normalizePane(text: string): string {
  const kept: string[] = []
  let blankRun = false
  for (const row of text.split("\n")) {
    const line = shaveEdges(stripControls(row).replace(BRAILLE, ""))
    if (line === "") {
      blankRun = true
      continue
    }
    if (CHROME_ONLY.test(line)) continue
    if (blankRun && kept.length > 0) kept.push("")
    blankRun = false
    kept.push(line)
  }
  return kept.length === 0 ? "" : `${kept.join("\n")}\n`
}

// Box drawing, block elements, braille spinners: every harness draws with these.
const CHROME = "\\u2500-\\u257F\\u2580-\\u259F\\u2800-\\u28FF"
const BRAILLE = /[\u2800-\u28FF]/g
// ponytail: control chars stripped by code point, not regex, to satisfy no-control-regex.
function stripControls(line: string): string {
  let out = ""
  for (const ch of line) {
    const code = ch.codePointAt(0) ?? 0
    if (code === 9) {
      out += ch
      continue
    }
    if (code < 32 || code === 127) continue
    out += ch
  }
  return out
}
const CHROME_ONLY = new RegExp(`^[${CHROME}\\s]+$`)
const CHROME_GLYPH = new RegExp(`[${CHROME}]`)
const LEAD_CHROME = new RegExp(`^[${CHROME}\\s]+`)
const TRAIL_CHROME = new RegExp(`[${CHROME}\\s]+$`)

/**
 * Removes a leading/trailing run of borders and padding, but only when the run
 * carries a border glyph: plain indentation and ASCII separators are content.
 */
function shaveEdges(line: string): string {
  line = line.trimEnd()
  const lead = line.match(LEAD_CHROME)?.[0] ?? ""
  if (lead && CHROME_GLYPH.test(lead)) line = line.slice(lead.length)
  const trail = line.match(TRAIL_CHROME)?.[0] ?? ""
  if (trail && CHROME_GLYPH.test(trail)) line = line.slice(0, line.length - trail.length)
  return line
}

/** Keeps only lines containing `pattern` (substring match); undefined keeps everything. */
export function filterLines(text: string, pattern: string | undefined): string {
  if (pattern === undefined) return text
  if (pattern === "") throw usageError("--grep pattern cannot be empty")
  const kept = text.split("\n").filter((line) => line.includes(pattern))
  return kept.length === 0 ? "" : `${kept.join("\n")}\n`
}

/**
 * Keeps matching lines plus `context` lines on each side, merging overlapping windows and marking
 * gaps with `--`. Empty pattern is a usage error.
 */
export function filterAround(text: string, pattern: string, context: number): string {
  if (pattern === "") throw usageError("--around pattern cannot be empty")
  const rows = text.split("\n")
  if (rows.length > 0 && rows[rows.length - 1] === "") rows.pop()
  const hits = new Set<number>()
  rows.forEach((line, index) => {
    if (!line.includes(pattern)) return
    for (let at = Math.max(0, index - context); at <= Math.min(rows.length - 1, index + context); at += 1) {
      hits.add(at)
    }
  })
  if (hits.size === 0) return ""
  const ordered = [...hits].sort((a, b) => a - b)
  const out: string[] = []
  let previous = -2
  for (const at of ordered) {
    if (at > previous + 1 && out.length > 0) out.push("--")
    out.push(rows[at]!)
    previous = at
  }
  return `${out.join("\n")}\n`
}
