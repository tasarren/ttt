import assert from "node:assert/strict"
import { test } from "node:test"

import { Tmux } from "../src/index.ts"
import type { TmuxOptions } from "../src/index.ts"

const NO_WAIT: TmuxOptions = { inputSettleMs: 0, postPasteMs: 0, enterPresses: 2, postSendMs: 0 }

function fakeTmux(replies: Record<string, string> = {}): { tmux: Tmux; calls: string[][] } {
  const calls: string[][] = []
  const tmux = new Tmux(NO_WAIT, async(args) => {
    calls.push(args)
    return replies[args[0]!] ?? ""
  })
  return { tmux, calls }
}

test("detectContext targets the caller's pane and parses the tab-joined line", async() => {
  const { tmux, calls } = fakeTmux({ "display-message": "work\tCODER\t@3\t%7\n" })
  assert.deepEqual(await tmux.detectContext("%7"), {
    session: "work", windowName: "CODER", windowId: "@3", paneId: "%7",
  })
  assert.deepEqual(calls[0]!.slice(0, 4), ["display-message", "-p", "-t", "%7"])
  await tmux.detectContext(undefined)
  assert.equal(calls[1]!.includes("-t"), false)
})

test("detectContext rejects an incomplete line", async() => {
  const { tmux } = fakeTmux({ "display-message": "work\tCODER\n" })
  await assert.rejects(tmux.detectContext("%1"), /unexpected tmux context/)
})

test("listWindows parses names and ids, skipping malformed lines", async() => {
  const { tmux } = fakeTmux({ "list-windows": "A\t@1\nB\t@2\nbroken\n\n" })
  assert.deepEqual(await tmux.listWindows("work"), [{ name: "A", id: "@1" }, { name: "B", id: "@2" }])
  assert.deepEqual(await tmux.findWindow("work", "B"), { name: "B", id: "@2" })
  assert.equal(await tmux.findWindow("work", "Z"), undefined)
})

test("findWindow picks the lowest window id when names collide", async() => {
  const { tmux } = fakeTmux({ "list-windows": "B\t@10\nB\t@2\nB\t@3\nA\t@1\n" })
  assert.deepEqual(await tmux.findWindow("work", "B"), { name: "B", id: "@2" })
})

test("compareWindowIds orders numerically, not lexicographically", async() => {
  const { compareWindowIds } = await import("../src/index.ts")
  assert.ok(compareWindowIds("@2", "@10") < 0)
  assert.ok(compareWindowIds("@10", "@2") > 0)
  assert.equal(compareWindowIds("@2", "@2"), 0)
})

test("sendText clears, pastes through a private buffer, presses Enter N times, and cleans up", async() => {
  const { tmux, calls } = fakeTmux()
  await tmux.sendText("@2", "hello")
  const verbs = calls.map((args) => args[0])
  assert.deepEqual(verbs, [
    "send-keys", "set-buffer", "paste-buffer", "send-keys", "send-keys", "delete-buffer",
  ])
  const buffer = calls[1]![2]
  assert.deepEqual(calls[1]!.slice(3), ["--", "hello"])
  assert.deepEqual(calls[2], ["paste-buffer", "-b", buffer, "-d", "-t", "@2"])
  assert.deepEqual(calls[3], ["send-keys", "-t", "@2", "Enter"])
})

test("capture asks for the last N lines and joins wrapped lines on request", async() => {
  const { tmux, calls } = fakeTmux({ "capture-pane": "line\n" })
  assert.equal(await tmux.capture("@2", 40, true), "line\n")
  assert.deepEqual(calls[0], ["capture-pane", "-p", "-t", "@2", "-S", "-40", "-J"])
  await tmux.capture("@2", 5, false)
  assert.deepEqual(calls[1], ["capture-pane", "-p", "-t", "@2", "-S", "-5"])
})
