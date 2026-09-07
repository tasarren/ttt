import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

import { assertName, isErrno } from "@ttt/board"
import { parse, printParseErrorCode } from "jsonc-parser"
import type { ParseError } from "jsonc-parser"

import { CliError } from "./cli-error.ts"

/** A stored session shape: `~/.ttt/layouts/<name>.jsonc`, hand-editable. */
export interface Layout {
  version: 1
  /** Default working directory; relative pane cwds resolve against it. */
  cwd?: string
  profile: string
  windows: readonly LayoutWindow[]
}

export interface LayoutWindow {
  name: string
  harness?: string
  /** A tmux `#{window_layout}` string; `panes.length` must equal its cell count. Absent means one pane. */
  layout?: string
  /** In `pane_index` order. */
  panes: readonly LayoutPane[]
}

export interface LayoutPane {
  /** Shell command line; `null` is a plain shell. */
  command: string | null
  /** The agent's pane: at most one per window; defaults to the first pane. */
  agent?: boolean
  cwd?: string
  /** `process` when `save` could only read the foreground process name, so a human should check it. */
  source?: "process"
}

export function layoutsRoot(home: string): string {
  return join(home, "layouts")
}

export function layoutPath(home: string, name: string): string {
  return join(layoutsRoot(home), `${name}.jsonc`)
}

export async function listLayouts(home: string): Promise<string[]> {
  try {
    const entries = await readdir(layoutsRoot(home))
    return entries.filter((entry) => entry.endsWith(".jsonc")).map((entry) => entry.slice(0, -".jsonc".length)).sort()
  } catch(error) {
    if (isErrno(error, "ENOENT")) return []
    throw error
  }
}

export async function readLayout(home: string, name: string): Promise<Layout> {
  checkLayoutName(name)
  const path = layoutPath(home, name)
  let text: string
  try {
    text = await readFile(path, "utf8")
  } catch(error) {
    if (isErrno(error, "ENOENT")) throw new CliError(`no layout named ${name} (run: ttt tmux layouts)`, 2)
    throw error
  }
  return parseLayout(text, path)
}

export async function writeLayout(home: string, name: string, layout: Layout, options: { force: boolean }): Promise<string> {
  checkLayoutName(name)
  const path = layoutPath(home, name)
  await mkdir(layoutsRoot(home), { recursive: true })
  if (!options.force && await exists(path)) throw new CliError(`layout ${name} already exists; pass --force to overwrite`)
  const temporary = `${path}.tmp.${process.pid}`
  await writeFile(temporary, `${JSON.stringify(layout, null, 2)}\n`, "utf8")
  await rename(temporary, path)
  return path
}

function checkLayoutName(name: string): void {
  try {
    assertName(name, "layout name")
  } catch(error) {
    throw new CliError(error instanceof Error ? error.message : String(error), 2)
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path)
    return true
  } catch(error) {
    if (isErrno(error, "ENOENT")) return false
    throw error
  }
}

/** Strict: unknown keys, wrong types, duplicate window names, and pane/cell mismatches are exit-2 errors naming the path. */
export function parseLayout(text: string, file: string): Layout {
  const errors: ParseError[] = []
  const raw: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors[0]) throw new CliError(`${file}: ${printParseErrorCode(errors[0].error)} at offset ${errors[0].offset}`, 2)
  const root = record(raw, file, "layout", ["version", "cwd", "profile", "windows"])
  if (root["version"] !== 1) throw new CliError(`${file}: version must be 1`, 2)
  const windowsRaw = root["windows"]
  if (!Array.isArray(windowsRaw) || windowsRaw.length === 0) throw new CliError(`${file}: windows must be a non-empty array`, 2)
  const windows = windowsRaw.map((window, index) => parseWindow(window, file, `windows[${index}]`))
  const names = new Set<string>()
  for (const window of windows) {
    if (names.has(window.name)) throw new CliError(`${file}: window name ${window.name} appears twice`, 2)
    names.add(window.name)
  }
  const cwd = optionalText(root["cwd"], file, "cwd")
  return {
    version: 1,
    ...(cwd !== undefined ? { cwd: expandHome(cwd) } : {}),
    profile: optionalText(root["profile"], file, "profile") ?? "agents",
    windows,
  }
}

function parseWindow(raw: unknown, file: string, path: string): LayoutWindow {
  const window = record(raw, file, path, ["name", "harness", "layout", "panes"])
  const name = optionalText(window["name"], file, `${path}.name`)
  if (name === undefined) throw new CliError(`${file}: ${path}.name is required`, 2)
  try {
    assertName(name, `${path}.name`)
  } catch(error) {
    throw new CliError(`${file}: ${error instanceof Error ? error.message : String(error)}`, 2)
  }
  const panesRaw = window["panes"]
  const panes = Array.isArray(panesRaw) && panesRaw.length > 0
    ? panesRaw.map((pane, index) => parsePane(pane, file, `${path}.panes[${index}]`))
    : [{ command: null }]
  const agents = panes.filter((pane) => pane.agent === true).length
  if (agents > 1) throw new CliError(`${file}: ${path} marks ${agents} panes as agent; at most one`, 2)
  const layout = optionalText(window["layout"], file, `${path}.layout`)
  if (layout !== undefined) {
    const cells = layoutCellCount(layout)
    if (cells === undefined) throw new CliError(`${file}: ${path}.layout is not a tmux window_layout string`, 2)
    if (cells !== panes.length) throw new CliError(`${file}: ${path}.panes has ${panes.length} entries but the layout has ${cells} cells`, 2)
  } else if (panes.length > 1) {
    throw new CliError(`${file}: ${path} has ${panes.length} panes but no layout string (save one with ttt tmux save)`, 2)
  }
  const harness = optionalText(window["harness"], file, `${path}.harness`)
  return { name, ...(harness !== undefined ? { harness } : {}), ...(layout !== undefined ? { layout } : {}), panes }
}

function parsePane(raw: unknown, file: string, path: string): LayoutPane {
  const pane = record(raw, file, path, ["command", "agent", "cwd", "source"])
  const command = pane["command"]
  if (command !== null && command !== undefined && (typeof command !== "string" || command === "")) {
    throw new CliError(`${file}: ${path}.command must be a non-empty string or null`, 2)
  }
  const agent = pane["agent"]
  if (agent !== undefined && typeof agent !== "boolean") throw new CliError(`${file}: ${path}.agent must be true or false`, 2)
  const source = pane["source"]
  if (source !== undefined && source !== "process") throw new CliError(`${file}: ${path}.source may only be "process"`, 2)
  const cwd = optionalText(pane["cwd"], file, `${path}.cwd`)
  return {
    command: command ?? null,
    ...(agent !== undefined ? { agent } : {}),
    ...(cwd !== undefined ? { cwd } : {}),
    ...(source !== undefined ? { source } : {}),
  }
}

/**
 * Cells in a tmux `#{window_layout}`: every `WxH,X,Y,ID` leaf. Containers are `WxH,X,Y{...}`
 * or `[...]` and carry no id, so counting leaves is counting `,ID` tokens that are followed
 * by a separator or the end.
 */
export function layoutCellCount(layout: string): number | undefined {
  const body = layout.replace(/^[0-9a-f]{4},/, "")
  if (!/^\d+x\d+,\d+,\d+/.test(body)) return undefined
  const leaves = body.match(/\d+x\d+,\d+,\d+,\d+(?=[,}\]]|$)/g)
  return leaves ? leaves.length : undefined
}

function record(value: unknown, file: string, path: string, known: string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new CliError(`${file}: ${path} must be an object`, 2)
  const unknown = Object.keys(value).find((key) => !known.includes(key))
  if (unknown) throw new CliError(`${file}: unknown key ${path}.${unknown}`, 2)
  return value as Record<string, unknown>
}

function optionalText(value: unknown, file: string, path: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string" || value === "") throw new CliError(`${file}: ${path} must be a non-empty string`, 2)
  return value
}

function expandHome(path: string): string {
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path
}
