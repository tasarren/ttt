import assert from "node:assert/strict"
import { test } from "node:test"

import { filterAround, filterLines } from "../src/commands/capture.ts"

test("filterLines keeps everything without a pattern and filters by substring", () => {
  assert.equal(filterLines("a\nb\n", undefined), "a\nb\n")
  assert.equal(filterLines("stop now\nnoise\nstop now x\n", "stop now"), "stop now\nstop now x\n")
  assert.equal(filterLines("a\nb\n", "zzz"), "")
  assert.throws(() => filterLines("a\n", ""), /--grep pattern cannot be empty/)
})

test("filterAround keeps context, merges overlaps, and marks gaps", () => {
  assert.equal(filterAround("a\nb\nHIT\nc\nd\n", "HIT", 1), "b\nHIT\nc\n")
  assert.equal(
    filterAround("HIT\na\nb\nc\nHIT\n", "HIT", 1),
    "HIT\na\n--\nc\nHIT\n",
  )
  assert.equal(filterAround("a\nHIT\nb\nHIT\nc\n", "HIT", 5), "a\nHIT\nb\nHIT\nc\n")
  assert.equal(filterAround("a\nb\n", "zzz", 2), "")
  assert.throws(() => filterAround("a\n", "", 1), /--around pattern cannot be empty/)
})
