import assert from "node:assert/strict"
import { test } from "node:test"

import { Tmux, resolveAgentPane } from "../src/index.ts"
import type { LivePane, TmuxOptions } from "../src/index.ts"

const NO_WAIT: TmuxOptions = { inputSettleMs: 0, postPasteMs: 0, enterPresses: 2, postSendMs: 0 }

function fakeTmux(replies: Record<string, string> = {}, ancestors: number[] = []): { tmux: Tmux; calls: string[][] } {
  const calls: string[][] = []
  const tmux = new Tmux(NO_WAIT, async(args) => {
    calls.push(args)
    return replies[args[0]!] ?? ""
  }, async() => ancestors)
  return { tmux, calls }
}

test("detectContext trusts PID ancestry over a stale TMUX_PANE", async() => {
  const { tmux, calls } = fakeTmux({ "list-panes": "work\tCODER\t@3\t%7\t0\t4242\n" }, [4242, 100])
  assert.deepEqual(await tmux.detectContext("%9"), {
    session: "work", windowName: "CODER", windowId: "@3", paneId: "%7", via: "pid-walk",
  })
  assert.deepEqual(calls.map((args) => args[0]), ["list-panes"])
})

test("detectContext falls back to the TMUX_PANE hint when ancestry misses", async() => {
  const { tmux, calls } = fakeTmux({ "display-message": "work\tCODER\t@3\t%7\n" })
  assert.deepEqual(await tmux.detectContext("%7"), {
    session: "work", windowName: "CODER", windowId: "@3", paneId: "%7", via: "pane-env",
  })
  assert.deepEqual(calls[0]!.slice(0, 4), ["display-message", "-p", "-t", "%7"])
})

test("detectContext refuses to guess without ancestry or pane", async() => {
  const { tmux } = fakeTmux({ "list-panes": "work\tCODER\t@3\t%7\t0\t4242\n" })
  await assert.rejects(tmux.detectContext(undefined), /cannot tell which tmux pane/)
})

test("listAllPanes parses live panes and skips malformed rows", async() => {
  const { tmux } = fakeTmux({ "list-panes": "work\tCODER\t@3\t%7\t0\t4242\nbroken\nwork\tX\t@4\t%8\t1\tnan\n" })
  assert.deepEqual(await tmux.listAllPanes(), [
    { session: "work", window: "CODER", windowId: "@3", pane: "%7", index: 0, pid: 4242 },
  ])
})

test("resolveAgentPane trusts a live binding, else the lowest-index pane, else the window", () => {
  const live: LivePane[] = [
    { session: "s", window: "A", windowId: "@1", pane: "%10", index: 2, pid: 1 },
    { session: "s", window: "A", windowId: "@1", pane: "%11", index: 1, pid: 2 },
    { session: "s", window: "B", windowId: "@2", pane: "%12", index: 1, pid: 3 },
  ]
  assert.equal(resolveAgentPane(live, "@1", { paneId: "%10", windowId: "@1" }), "%10")
  assert.equal(resolveAgentPane(live, "@1", { paneId: "%10", windowId: "@2" }), "%11")
  assert.equal(resolveAgentPane(live, "@1", { paneId: "%99", windowId: "@1" }), "%11")
  assert.equal(resolveAgentPane(live, "@1", undefined), "%11")
  assert.equal(resolveAgentPane([], "@1", undefined), "@1")
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

test("winnersByName keeps the lowest id per window name", async() => {
  const { winnersByName } = await import("../src/index.ts")
  const winners = winnersByName([
    { name: "B", id: "@10" },
    { name: "B", id: "@2" },
    { name: "A", id: "@1" },
  ])
  assert.deepEqual([...winners.entries()], [[
    "B",
    { name: "B", id: "@2" },
  ], [
    "A",
    { name: "A", id: "@1" },
  ]])
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
