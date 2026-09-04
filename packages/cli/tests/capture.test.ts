import assert from "node:assert/strict"
import { test } from "node:test"

import { filterLines } from "../src/commands/capture.ts"

test("filterLines keeps everything without a pattern and filters by substring", () => {
  assert.equal(filterLines("a\nb\n", undefined), "a\nb\n")
  assert.equal(filterLines("stop now\nnoise\nstop now x\n", "stop now"), "stop now\nstop now x\n")
  assert.equal(filterLines("a\nb\n", "zzz"), "")
  assert.throws(() => filterLines("a\n", ""), /--grep pattern cannot be empty/)
})
