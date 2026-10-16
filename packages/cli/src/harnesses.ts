import { HARNESS_PRESETS, harnessPreset } from "@ttt/tmux"
import { assertName } from "@ttt/board"

import { CliError } from "./cli-error.ts"

/** One harness the operator may start: the shipped preset merged with the settings entry. */
export interface ResolvedHarness {
  name: string
  bin: string
  ready: RegExp
  /** Screen line meaning this harness is out of tokens; placeholder, matched nowhere yet. */
  limited?: RegExp
  note?: string
}

export interface HarnessSettings {
  /** Name -> resolved harness; the shipped presets when the settings file has no `harnesses` section. */
  declared: Readonly<Record<string, ResolvedHarness>>
  /** The one entry marked `default: true`; undefined when the section is absent. */
  defaultName: string | undefined
  /** Where the list came from, for error messages: the settings file or "shipped". */
  source: string
}

const ENTRY_KEYS = ["bin", "ready", "limited", "default"]

/** Without a section: every shipped preset is allowed, none is the default. */
export function shippedHarnesses(): HarnessSettings {
  const declared: Record<string, ResolvedHarness> = {}
  for (const [name, preset] of Object.entries(HARNESS_PRESETS)) {
    declared[name] = {
      name,
      bin: preset.command,
      ready: preset.ready,
      ...(preset.limited !== undefined ? { limited: preset.limited } : {}),
      ...(preset.note !== undefined ? { note: preset.note } : {}),
    }
  }
  return { declared, defaultName: undefined, source: "shipped" }
}

/**
 * `harnesses` from the settings file. Only declared names are allowed afterwards; a name without a
 * shipped preset must bring `bin` and `ready`; exactly one entry is `default: true`.
 */
export function parseHarnesses(value: unknown, file: string): HarnessSettings {
  if (value === undefined) return shippedHarnesses()
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new CliError(`${file}: harnesses must be an object`, 2)
  const declared: Record<string, ResolvedHarness> = {}
  const defaults: string[] = []
  for (const [name, raw] of Object.entries(value)) {
    const path = `harnesses.${name}`
    try {
      assertName(name, "harness name")
    } catch(error) {
      throw new CliError(`${file}: ${error instanceof Error ? error.message : String(error)}`, 2)
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new CliError(`${file}: ${path} must be an object`, 2)
    const entry = raw as Record<string, unknown>
    const unknown = Object.keys(entry).find((key) => !ENTRY_KEYS.includes(key))
    if (unknown) throw new CliError(`${file}: unknown setting "${path}.${unknown}"`, 2)
    const preset = harnessPreset(name)
    const bin = optionalText(entry["bin"], file, `${path}.bin`) ?? preset?.command
    if (bin === undefined) throw new CliError(`${file}: ${path}.bin is required (no shipped preset for "${name}"; shipped: ${Object.keys(HARNESS_PRESETS).join(", ")})`, 2)
    const readyText = optionalText(entry["ready"], file, `${path}.ready`)
    let ready = preset?.ready
    if (readyText !== undefined) {
      try {
        ready = new RegExp(readyText)
      } catch(error) {
        throw new CliError(`${file}: ${path}.ready is not a valid regular expression: ${error instanceof Error ? error.message : String(error)}`, 2)
      }
    }
    if (ready === undefined) throw new CliError(`${file}: ${path}.ready is required (no shipped preset for "${name}")`, 2)
    const limitedText = optionalText(entry["limited"], file, `${path}.limited`)
    let limited = preset?.limited
    if (limitedText !== undefined) {
      try {
        limited = new RegExp(limitedText)
      } catch(error) {
        throw new CliError(`${file}: ${path}.limited is not a valid regular expression: ${error instanceof Error ? error.message : String(error)}`, 2)
      }
    }
    const isDefault = entry["default"]
    if (isDefault !== undefined && typeof isDefault !== "boolean") throw new CliError(`${file}: ${path}.default must be true or false`, 2)
    if (isDefault === true) defaults.push(name)
    // A note only makes sense when the preset's `ready` is still in use.
    declared[name] = {
      name,
      bin,
      ready,
      ...(limited !== undefined ? { limited } : {}),
      ...(preset?.note !== undefined && readyText === undefined ? { note: preset.note } : {}),
    }
  }
  if (Object.keys(declared).length === 0) throw new CliError(`${file}: harnesses declares nothing; remove the section to allow the shipped presets`, 2)
  if (defaults.length !== 1) {
    throw new CliError(`${file}: harnesses: ${defaults.length} marked default${defaults.length === 0 ? "; set harnesses.NAME.default to true on one of them" : `: ${defaults.join(", ")}; only one may be`}`, 2)
  }
  return { declared, defaultName: defaults[0], source: file }
}

function optionalText(value: unknown, file: string, path: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string" || value === "") throw new CliError(`${file}: ${path} must be a non-empty string`, 2)
  return value
}
