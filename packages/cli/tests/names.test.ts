import assert from "node:assert/strict"
import { test } from "node:test"

import { HARNESS_PRESETS, harnessPreset } from "@ttt/tmux"

import { MAX_WINDOW_NAME, checkWindowName, generateSeatName, generateWindowName } from "../src/commands/tmux/names.ts"
import { withBareValues } from "../src/commands/tmux/lifecycle.ts"
import { parseHarnesses, shippedHarnesses } from "../src/harnesses.ts"

test("generateWindowName picks the lowest free HARNESS-N and never a taken name", () => {
  assert.equal(generateWindowName("claude", new Set()), "CLAUDE-1")
  assert.equal(generateWindowName("claude", new Set(["CLAUDE-1", "CLAUDE-2"])), "CLAUDE-3")
  assert.equal(generateWindowName("claude", new Set(["CLAUDE-2"])), "CLAUDE-1", "gaps are reused")
  assert.equal(generateWindowName("W", new Set()), "W-1", "a shell window is scratch: W-N")
  assert.equal(generateSeatName("REVIEWER", new Set()), "REVIEWER-2", "the window's own name is seat 1")
  assert.equal(generateSeatName("REVIEWER", new Set(["REVIEWER-2", "REVIEWER-3"])), "REVIEWER-4")
  assert.equal(generateWindowName("open-code!", new Set()), "OPENCODE-1", "stems are letters and digits only")
  const long = generateWindowName("averyveryverylongharness", new Set())
  assert.ok(long.length <= MAX_WINDOW_NAME, long)
  assert.match(long, /-1$/)
})

test("checkWindowName enforces charset and the bar-friendly length cap", () => {
  checkWindowName("REVIEWER-12")
  assert.throws(() => { checkWindowName("THIRTEEN-CHAR") }, /longer than 12 characters/)
  assert.throws(() => { checkWindowName("a b") }, /may contain only/)
})

test("every shipped harness preset has a command and a readiness pattern; a shell is not a harness", () => {
  for (const [name, preset] of Object.entries(HARNESS_PRESETS)) {
    assert.ok(preset.command.length > 0, name)
    assert.ok(preset.ready instanceof RegExp, name)
  }
  assert.equal(harnessPreset("sh"), undefined)
  assert.ok(harnessPreset("claude")?.ready.test("  ⏵⏵ auto mode on (shift+tab to cycle)"))
  assert.ok(harnessPreset("opencode")?.ready.test("  ┃  Ask anything... \"Fix broken tests\""))
  assert.ok(harnessPreset("opencode2")?.ready.test("  ┃  Ask anything\u2026 \"Fix broken tests\""))
  assert.ok(harnessPreset("codex")?.ready.test("› Ask Codex to do anything"))
  assert.equal(harnessPreset("gemini"), undefined)
  assert.equal(harnessPreset("constructor"), undefined, "no prototype leakage")
})

test("withBareValues spells a valueless --harness as --harness= and leaves everything else alone", () => {
  assert.deepEqual(withBareValues(["--window", "X", "--harness"]), ["--window", "X", "--harness="])
  assert.deepEqual(withBareValues(["--harness", "--cwd", "/tmp"]), ["--harness=", "--cwd", "/tmp"])
  assert.deepEqual(withBareValues(["--harness", "codex"]), ["--harness", "codex"])
  assert.deepEqual(withBareValues(["--harness=claude"]), ["--harness=claude"])
  assert.deepEqual(withBareValues(["--pane", "--in", "A", "--harness"]), ["--pane=", "--in", "A", "--harness="])
  assert.deepEqual(withBareValues(["--pane", "AUX", "--in", "A"]), ["--pane", "AUX", "--in", "A"])
})

test("parseHarnesses: shipped presets without a section; declared entries merge over presets; exactly one default", () => {
  const shipped = shippedHarnesses()
  assert.deepEqual(Object.keys(shipped.declared), ["claude", "opencode", "opencode2", "codex"])
  assert.equal(shipped.defaultName, undefined)
  const file = "/x/settings.jsonc"
  const parsed = parseHarnesses({
    claude: { default: true },
    opencode: { bin: "/opt/oc/opencode" },
    codex: { ready: "custom prompt" },
    gemini: { bin: "gemini", ready: "Type your message" },
  }, file)
  assert.equal(parsed.defaultName, "claude")
  assert.equal(parsed.source, file)
  assert.equal(parsed.declared["claude"]!.bin, "claude", "preset bin kept")
  assert.ok(parsed.declared["claude"]!.note, "preset note kept while its ready regex is in use")
  assert.equal(parsed.declared["opencode"]!.bin, "/opt/oc/opencode")
  assert.equal(parsed.declared["codex"]!.ready.source, "custom prompt")
  assert.equal(parsed.declared["codex"]!.note, undefined, "a note about the preset's prompt is dropped with the preset regex")
  assert.equal(parsed.declared["gemini"]!.bin, "gemini")
  assert.equal(parsed.declared["claude"]!.limited, undefined, "no preset ships a limited pattern yet")
  const opencode2 = parseHarnesses({ opencode2: { default: true } }, file)
  assert.equal(opencode2.defaultName, "opencode2")
  assert.equal(opencode2.declared["opencode2"]!.bin, "opencode2")
  const withLimited = parseHarnesses({ claude: { default: true, limited: "out of tokens" } }, file)
  assert.equal(withLimited.declared["claude"]!.limited!.source, "out of tokens")
  assert.ok(withLimited.declared["claude"]!.note, "a limited pattern does not drop the ready note")
  const bad = (value: unknown, pattern: RegExp): void => {
    assert.throws(() => { parseHarnesses(value, file) }, (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, pattern)
      return true
    })
  }
  bad({ claude: {} }, /harnesses: 0 marked default; set harnesses\.NAME\.default to true/)
  bad({ claude: { default: true }, codex: { default: true } }, /2 marked default: claude, codex; only one may be/)
  bad({ gemini: { default: true } }, /harnesses\.gemini\.bin is required \(no shipped preset for "gemini"; shipped: claude, opencode, opencode2, codex\)/)
  bad({ gemini: { bin: "gemini", default: true } }, /harnesses\.gemini\.ready is required/)
  bad({ claude: { default: true, ready: "(" } }, /harnesses\.claude\.ready is not a valid regular expression/)
  bad({ claude: { default: true, limited: "(" } }, /harnesses\.claude\.limited is not a valid regular expression/)
  bad({ claude: { default: true, foo: 1 } }, /unknown setting "harnesses\.claude\.foo"/)
  bad({ "bad name": { default: true } }, /harness name/)
  bad({}, /harnesses declares nothing/)
  bad([], /harnesses must be an object/)
})
