import assert from "node:assert/strict"
import { test } from "node:test"

import { filterAround, filterLines, normalizePane } from "../src/commands/capture.ts"

test("filterLines keeps everything without a pattern and filters by substring", () => {
  assert.equal(filterLines("a\nb\n", undefined), "a\nb\n")
  assert.equal(filterLines("stop now\nnoise\nstop now x\n", "stop now"), "stop now\nstop now x\n")
  assert.equal(filterLines("a\nb\n", "zzz"), "")
  assert.throws(() => filterLines("a\n", ""), /--grep pattern cannot be empty/)
})

test("normalizePane strips TUI chrome but keeps bodies byte-identical", () => {
  assert.equal(normalizePane("\u2501\u2501\u2501\nhello\n\u2503\u2503\u2503\n"), "hello\n")
  assert.equal(normalizePane("\u2503  spaced body  \u2503\n"), "spaced body\n")
  const spinner = `load ${String.fromCharCode(0x280b)} ing\n`
  assert.equal(normalizePane(spinner).includes(String.fromCharCode(0x280b)), false)
  assert.equal(normalizePane("---\n| a | b |\n  indented\n"), "---\n| a | b |\n  indented\n")
  assert.equal(normalizePane("\n\na\n\n\nb\n\n"), "a\n\nb\n")
  assert.equal(normalizePane("trail   \n"), "trail\n")
  assert.equal(normalizePane(""), "")
  assert.equal(normalizePane("plain line\n"), "plain line\n")
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
