import assert from "node:assert/strict"
import { test } from "node:test"

import { TmuxError, TmuxFailure, classifyFailure, createRunner, parseVersion, versionAtLeast } from "../src/index.ts"

test("classifyFailure maps every stderr shape tmux 3.7 emits to its code", () => {
  const cases: Array<[string, TmuxFailure]> = [
    ["no server running on /tmp/tmux-1000/x", TmuxFailure.NoServer],
    ["error connecting to /tmp/tmux-1000/x (No such file or directory)", TmuxFailure.NoServer],
    ["can't find session: nope", TmuxFailure.NoSession],
    ["no such window: @999", TmuxFailure.NoTarget],
    ["can't find pane: %99", TmuxFailure.NoTarget],
    ["can't find window: 7", TmuxFailure.NoTarget],
    ["target pane has exited", TmuxFailure.PaneDead],
    ["invalid option: no-such-option", TmuxFailure.BadOption],
    ["empty value", TmuxFailure.BadOption],
    ["no current client", TmuxFailure.NoClient],
    ["something new", TmuxFailure.Unknown],
    ["", TmuxFailure.Unknown],
  ]
  for (const [stderr, expected] of cases) {
    assert.equal(classifyFailure(stderr), expected, JSON.stringify(stderr))
  }
})

test("createRunner turns a missing server into a typed no_server error naming the verb", async() => {
  const run = createRunner({ socket: `ttt-runner-none-${process.pid}` })
  await assert.rejects(run(["list-windows"]), (error: unknown) => {
    assert.ok(error instanceof TmuxError)
    assert.equal(error.code, TmuxFailure.NoServer)
    assert.equal(error.verb, "list-windows")
    assert.match(error.message, /^tmux list-windows: /)
    return true
  })
})

test("parseVersion reads major.minor out of every tmux version string shape", () => {
  assert.deepEqual(parseVersion("tmux 3.7c"), [3, 7])
  assert.deepEqual(parseVersion("tmux next-3.8"), [3, 8])
  assert.deepEqual(parseVersion("3.2a\n"), [3, 2])
  assert.equal(parseVersion("tmux master"), undefined)
})

test("versionAtLeast compares major first, then minor", () => {
  assert.ok(versionAtLeast([3, 7], [3, 2]))
  assert.ok(versionAtLeast([3, 2], [3, 2]))
  assert.ok(versionAtLeast([4, 0], [3, 9]))
  assert.ok(!versionAtLeast([3, 1], [3, 2]))
  assert.ok(!versionAtLeast([2, 9], [3, 0]))
})
