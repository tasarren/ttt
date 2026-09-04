import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

import { parse, printParseErrorCode } from "jsonc-parser"
import type { ParseError } from "jsonc-parser"
import { DEFAULT_TMUX_OPTIONS } from "@ttt/tmux"
import type { TmuxOptions } from "@ttt/tmux"
import type { LockOptions } from "@ttt/board"

import { CliError } from "./cli-error.ts"

export interface Settings {
  /** `$TTT_HOME`, default `~/.ttt`. Holds the settings file and, by default, the boards. */
  home: string
  /** Boards live at `<boardRoot>/<tmux session name>`. */
  boardRoot: string
  notifySeconds: number
  readMax: number
  capture: { lines: number; maxLines: number }
  lock: LockOptions
  tmux: TmuxOptions
  /** `$TMUX_PANE`: the pane this process was started in, needed to identify the caller's window. */
  currentPane: string | undefined
}

export const SETTINGS_FILES = ["settings.jsonc", "settings.json"] as const

export function defaultSettings(home: string): Settings {
  return {
    home,
    boardRoot: join(home, "boards"),
    notifySeconds: 60,
    readMax: 10,
    capture: { lines: 40, maxLines: 500 },
    lock: { timeoutMs: 10_000, staleMs: 60_000 },
    tmux: { ...DEFAULT_TMUX_OPTIONS },
    currentPane: undefined,
  }
}

/** The only place ttt reads `process.env`: `TTT_HOME` picks the home, `TMUX_PANE` names the caller's pane. */
export async function resolveSettings(env: NodeJS.ProcessEnv = process.env): Promise<Settings> {
  const home = env["TTT_HOME"] ?? join(homedir(), ".ttt")
  const defaults = defaultSettings(home)
  const found = await readSettingsFile(home)
  const settings = found ? applySettings(defaults, found.file, found.text) : defaults
  return { ...settings, currentPane: env["TMUX_PANE"] }
}

async function readSettingsFile(home: string): Promise<{ file: string; text: string } | undefined> {
  for (const name of SETTINGS_FILES) {
    const file = join(home, name)
    try {
      return { file, text: await readFile(file, "utf8") }
    } catch(error) {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) throw error
    }
  }
  return undefined
}

function applySettings(defaults: Settings, file: string, text: string): Settings {
  const errors: ParseError[] = []
  const raw: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors[0]) {
    throw new CliError(`${file}: ${printParseErrorCode(errors[0].error)} at offset ${errors[0].offset}`, 2)
  }
  const root = section(raw, file, "settings", ["boardRoot", "notifySeconds", "readMax", "capture", "lock", "tmux"])
  const capture = section(root["capture"], file, "capture", ["lines", "maxLines"])
  const lock = section(root["lock"], file, "lock", ["timeoutMs", "staleMs"])
  const tmux = section(root["tmux"], file, "tmux", ["inputSettleMs", "postPasteMs", "enterPresses", "postSendMs"])
  const int = (value: unknown, path: string, fallback: number): number => positiveInt(value, file, path, fallback)
  const atLeastOne = (value: unknown, path: string, fallback: number): number => {
    const parsed = int(value, path, fallback)
    if (parsed < 1) throw new CliError(`${file}: ${path} must be an integer of at least 1`, 2)
    return parsed
  }

  return {
    home: defaults.home,
    boardRoot: expandHome(text_(root["boardRoot"], file, "boardRoot", defaults.boardRoot)),
    notifySeconds: int(root["notifySeconds"], "notifySeconds", defaults.notifySeconds),
    readMax: atLeastOne(root["readMax"], "readMax", defaults.readMax),
    capture: {
      lines: atLeastOne(capture["lines"], "capture.lines", defaults.capture.lines),
      maxLines: atLeastOne(capture["maxLines"], "capture.maxLines", defaults.capture.maxLines),
    },
    lock: {
      timeoutMs: int(lock["timeoutMs"], "lock.timeoutMs", defaults.lock.timeoutMs),
      staleMs: int(lock["staleMs"], "lock.staleMs", defaults.lock.staleMs),
    },
    tmux: {
      inputSettleMs: int(tmux["inputSettleMs"], "tmux.inputSettleMs", defaults.tmux.inputSettleMs),
      postPasteMs: int(tmux["postPasteMs"], "tmux.postPasteMs", defaults.tmux.postPasteMs),
      enterPresses: int(tmux["enterPresses"], "tmux.enterPresses", defaults.tmux.enterPresses),
      postSendMs: int(tmux["postSendMs"], "tmux.postSendMs", defaults.tmux.postSendMs),
    },
    currentPane: defaults.currentPane,
  }
}

// ponytail: a 3-helper validator instead of a schema library; the settings shape is flat and tiny.
function section(value: unknown, file: string, path: string, known: string[]): Record<string, unknown> {
  if (value === undefined) return {}
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CliError(`${file}: ${path} must be an object`, 2)
  }
  const unknown = Object.keys(value).find((key) => !known.includes(key))
  if (unknown) throw new CliError(`${file}: unknown setting "${path === "settings" ? "" : `${path}.`}${unknown}"`, 2)
  return value as Record<string, unknown>
}

function positiveInt(value: unknown, file: string, path: string, fallback: number): number {
  if (value === undefined) return fallback
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new CliError(`${file}: ${path} must be a non-negative integer`, 2)
  }
  return value
}

function text_(value: unknown, file: string, path: string, fallback: string): string {
  if (value === undefined) return fallback
  if (typeof value !== "string" || value === "") throw new CliError(`${file}: ${path} must be a non-empty string`, 2)
  return value
}

function expandHome(path: string): string {
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path
}
