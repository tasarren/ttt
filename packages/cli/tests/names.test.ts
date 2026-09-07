import assert from "node:assert/strict"
import { test } from "node:test"

import { HARNESS_PRESETS, harnessPreset } from "@ttt/tmux"

import { MAX_WINDOW_NAME, checkWindowName, generateWindowName } from "../src/commands/tmux/names.ts"
import { withBareHarness } from "../src/commands/tmux/lifecycle.ts"
import { parseHarnesses, shippedHarnesses } from "../src/harnesses.ts"

test("generateWindowName picks the lowest free HARNESS-N and never a taken name", () => {
  assert.equal(generateWindowName("claude", new Set()), "CLAUDE-1")
  assert.equal(generateWindowName("claude", new Set(["CLAUDE-1", "CLAUDE-2"])), "CLAUDE-3")
  assert.equal(generateWindowName("claude", new Set(["CLAUDE-2"])), "CLAUDE-1", "gaps are reused")
  assert.equal(generateWindowName("W", new Set()), "W-1", "a shell window is furniture: W-N")
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
  assert.ok(harnessPreset("codex")?.ready.test("› Ask Codex to do anything"))
  assert.equal(harnessPreset("gemini"), undefined)
  assert.equal(harnessPreset("constructor"), undefined, "no prototype leakage")
})

test("withBareHarness spells a valueless --harness as --harness= and leaves everything else alone", () => {
  assert.deepEqual(withBareHarness(["--window", "X", "--harness"]), ["--window", "X", "--harness="])
  assert.deepEqual(withBareHarness(["--harness", "--cwd", "/tmp"]), ["--harness=", "--cwd", "/tmp"])
  assert.deepEqual(withBareHarness(["--harness", "codex"]), ["--harness", "codex"])
  assert.deepEqual(withBareHarness(["--harness=claude"]), ["--harness=claude"])
})

test("parseHarnesses: shipped presets without a section; declared entries merge over presets; exactly one default", () => {
  const shipped = shippedHarnesses()
  assert.deepEqual(Object.keys(shipped.declared), ["claude", "opencode", "codex"])
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
  const bad = (value: unknown, pattern: RegExp): void => {
    assert.throws(() => { parseHarnesses(value, file) }, (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, pattern)
      return true
    })
  }
  bad({ claude: {} }, /harnesses: 0 marked default; set harnesses\.NAME\.default to true/)
  bad({ claude: { default: true }, codex: { default: true } }, /2 marked default: claude, codex; only one may be/)
  bad({ gemini: { default: true } }, /harnesses\.gemini\.bin is required \(no shipped preset for "gemini"; shipped: claude, opencode, codex\)/)
  bad({ gemini: { bin: "gemini", default: true } }, /harnesses\.gemini\.ready is required/)
  bad({ claude: { default: true, ready: "(" } }, /harnesses\.claude\.ready is not a valid regular expression/)
  bad({ claude: { default: true, foo: 1 } }, /unknown setting "harnesses\.claude\.foo"/)
  bad({ "bad name": { default: true } }, /harness name/)
  bad({}, /harnesses declares nothing/)
  bad([], /harnesses must be an object/)
})
