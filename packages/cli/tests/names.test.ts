import assert from "node:assert/strict"
import { test } from "node:test"

import { HARNESS_PRESETS, harnessPreset } from "@ttt/tmux"

import { MAX_WINDOW_NAME, checkWindowName, generateWindowName } from "../src/commands/tmux/names.ts"

test("generateWindowName picks the lowest free HARNESS-N and never a taken name", () => {
  assert.equal(generateWindowName("claude", new Set()), "CLAUDE-1")
  assert.equal(generateWindowName("claude", new Set(["CLAUDE-1", "CLAUDE-2"])), "CLAUDE-3")
  assert.equal(generateWindowName("claude", new Set(["CLAUDE-2"])), "CLAUDE-1", "gaps are reused")
  assert.equal(generateWindowName(undefined, new Set()), "AGENT-1")
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

test("every shipped harness preset has a command and a readiness pattern; unknown names are undefined", () => {
  for (const [name, preset] of Object.entries(HARNESS_PRESETS)) {
    assert.ok(preset.command.length > 0, name)
    assert.ok(preset.ready instanceof RegExp, name)
  }
  assert.ok(harnessPreset("sh")?.ready.test("sh-5.3$ "))
  assert.ok(harnessPreset("sh")?.ready.test("$"))
  assert.ok(!harnessPreset("sh")?.ready.test("$ echo still typing"))
  assert.ok(harnessPreset("claude")?.ready.test("  ⏵⏵ auto mode on (shift+tab to cycle)"))
  assert.ok(harnessPreset("opencode")?.ready.test("  ┃  Ask anything... \"Fix broken tests\""))
  assert.ok(harnessPreset("codex")?.ready.test("› Ask Codex to do anything"))
  assert.equal(harnessPreset("gemini"), undefined)
  assert.equal(harnessPreset("constructor"), undefined, "no prototype leakage")
})
