import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { after, test } from "node:test"

import { MESSAGE_OPTIONS, boundedInt, parseCommandArgs, readMessagePayload, splitAtTerminator } from "../src/args.ts"

let dir = ""
after(async() => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

test("splitAtTerminator separates options from the message words", () => {
  assert.deepEqual(splitAtTerminator(["B", "--urgent", "--", "hi", "--there"]), {
    head: ["B", "--urgent"], body: ["hi", "--there"],
  })
  assert.deepEqual(splitAtTerminator(["B", "--file", "x"]), { head: ["B", "--file", "x"], body: undefined })
})

test("parseCommandArgs turns unknown options and missing values into exit-2 usage errors", () => {
  const parsed = parseCommandArgs(["B", "--replace", "k", "--no-reply"], MESSAGE_OPTIONS)
  assert.deepEqual(parsed.positionals, ["B"])
  assert.equal(parsed.values.replace, "k")
  assert.equal(parsed.values["no-reply"], true)
  assert.throws(() => parseCommandArgs(["--bogus"], MESSAGE_OPTIONS), (error: { exitCode?: number; message: string }) => {
    assert.equal(error.exitCode, 2)
    assert.match(error.message, /--bogus/)
    return true
  })
  assert.throws(() => parseCommandArgs(["--replace"], MESSAGE_OPTIONS), /--replace/)
})

test("readMessagePayload: inline words, --file, stdin, and their conflicts", async() => {
  dir = await mkdtemp(join(tmpdir(), "ttt-args-"))
  const file = join(dir, "body.txt")
  await writeFile(file, "from file\n\n")

  const inline = await readMessagePayload(parseCommandArgs(["--urgent"], MESSAGE_OPTIONS).values, ["a", "b"])
  assert.equal(inline.body, "a b")
  assert.equal(inline.priority, "urgent")
  assert.equal(inline.replyExpected, true)

  const fromFile = await readMessagePayload(parseCommandArgs(["--file", file, "--no-reply"], MESSAGE_OPTIONS).values, undefined)
  assert.equal(fromFile.body, "from file", "trailing whitespace is trimmed")
  assert.equal(fromFile.replyExpected, false)

  const fromStdin = await readMessagePayload(parseCommandArgs([], MESSAGE_OPTIONS).values, undefined, Readable.from(["piped ", "text\n"]))
  assert.equal(fromStdin.body, "piped text")

  await assert.rejects(readMessagePayload(parseCommandArgs(["--file", file], MESSAGE_OPTIONS).values, ["x"]), /cannot combine/)
  await assert.rejects(readMessagePayload(parseCommandArgs([], MESSAGE_OPTIONS).values, ["  "]), /empty/)
  await assert.rejects(readMessagePayload(parseCommandArgs(["--file", join(dir, "missing")], MESSAGE_OPTIONS).values, undefined), /cannot read/)
})

test("boundedInt validates numeric flags", () => {
  assert.equal(boundedInt(undefined, "--max", 10, 1000), 10)
  assert.equal(boundedInt("7", "--max", 10, 1000), 7)
  assert.throws(() => boundedInt("0", "--max", 10, 1000), /between 1 and 1000/)
  assert.throws(() => boundedInt("x", "--max", 10, 1000), /between 1 and 1000/)
})
