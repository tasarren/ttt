import assert from "node:assert/strict"
import { test } from "node:test"

import { Tmux, parsePaneAddress, resolveAgent } from "../src/index.ts"
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
  const { tmux, calls } = fakeTmux({ "list-panes": "work\tCODER\t@3\t%7\t0\t4242\t\n" }, [4242, 100])
  assert.deepEqual(await tmux.identity.detect("%9"), {
    session: "work", windowName: "CODER", windowId: "@3", paneId: "%7", via: "pid-walk",
  })
  assert.deepEqual(calls.map((args) => args[0]), ["list-panes"])
})

test("detectContext falls back to the TMUX_PANE hint when ancestry misses", async() => {
  const { tmux, calls } = fakeTmux({ "display-message": "work\tCODER\t@3\t%7\n" })
  assert.deepEqual(await tmux.identity.detect("%7"), {
    session: "work", windowName: "CODER", windowId: "@3", paneId: "%7", via: "pane-env",
  })
  assert.deepEqual(calls[0]!.slice(0, 4), ["display-message", "-p", "-t", "%7"])
})

test("detectContext refuses to guess without ancestry or pane", async() => {
  const { tmux } = fakeTmux({ "list-panes": "work\tCODER\t@3\t%7\t0\t4242\t\n" })
  await assert.rejects(tmux.identity.detect(undefined), /cannot tell which tmux pane/)
})

test("listAllPanes parses live panes and skips malformed rows", async() => {
  const { tmux } = fakeTmux({ "list-panes": "work\tCODER\t@3\t%7\t0\t4242\tCODER\nbroken\nwork\tX\t@4\t%8\t1\tnan\t\n" })
  assert.deepEqual(await tmux.inventory.listAllPanes(), [
    { session: "work", window: "CODER", windowId: "@3", pane: "%7", index: 0, pid: 4242, agent: "CODER" },
  ])
})

test("resolveAgent: a stamp anywhere in the session wins; an unregistered window seats its lowest pane", () => {
  const live: LivePane[] = [
    { session: "s", window: "A", windowId: "@1", pane: "%10", index: 2, pid: 1, agent: "A" },
    { session: "s", window: "A", windowId: "@1", pane: "%11", index: 1, pid: 2, agent: "A-2" },
    { session: "s", window: "B", windowId: "@2", pane: "%13", index: 2, pid: 3, agent: undefined },
    { session: "s", window: "B", windowId: "@2", pane: "%12", index: 1, pid: 4, agent: undefined },
    { session: "s", window: "C", windowId: "@3", pane: "%14", index: 1, pid: 5, agent: "B" },
  ]
  assert.deepEqual(resolveAgent(live, { id: "@1", name: "A" }, "A"), { windowId: "@1", windowName: "A", paneId: "%10", registered: true }, "the stamp wins over a lower index")
  assert.deepEqual(resolveAgent(live, undefined, "A-2"), { windowId: "@1", windowName: "A", paneId: "%11", registered: true }, "a second agent is found by its stamp without a window")
  assert.deepEqual(resolveAgent(live, { id: "@3", name: "C" }, "C"), { windowId: "@3", windowName: "C", paneId: "%14", registered: false }, "one pane stamped otherwise still seats the window's main agent")
  assert.deepEqual(resolveAgent(live, { id: "@2", name: "B" }, "B"), { windowId: "@3", windowName: "C", paneId: "%14", registered: true }, "a stamp in another window beats the window called B")
  assert.equal(resolveAgent(live, undefined, "Z"), undefined, "no stamp and no window")
  assert.equal(resolveAgent([], { id: "@1", name: "A" }, "A"), undefined, "a window without panes seats nobody")
})

test("parsePaneAddress: NAME, NAME.N, %id; anything else is undefined", () => {
  assert.deepEqual(parsePaneAddress("CODER"), { kind: "agent", window: "CODER" })
  assert.deepEqual(parsePaneAddress("CODER.2"), { kind: "index", window: "CODER", index: 2 })
  assert.deepEqual(parsePaneAddress("%14"), { kind: "id", pane: "%14" })
  assert.equal(parsePaneAddress(""), undefined)
  assert.equal(parsePaneAddress("a.b"), undefined)
  assert.equal(parsePaneAddress(".1"), undefined)
})

test("detectContext rejects an incomplete line", async() => {
  const { tmux } = fakeTmux({ "display-message": "work\tCODER\n" })
  await assert.rejects(tmux.identity.detect("%1"), /unexpected tmux context/)
})

test("listWindows parses names and ids, skipping malformed lines", async() => {
  const { tmux } = fakeTmux({ "list-windows": "A\t@1\nB\t@2\nbroken\n\n" })
  assert.deepEqual(await tmux.inventory.listWindows("work"), [{ name: "A", id: "@1" }, { name: "B", id: "@2" }])
  assert.deepEqual(await tmux.windows.find("work", "B"), { name: "B", id: "@2" })
  assert.equal(await tmux.windows.find("work", "Z"), undefined)
})

test("findWindow picks the lowest window id when names collide", async() => {
  const { tmux } = fakeTmux({ "list-windows": "B\t@10\nB\t@2\nB\t@3\nA\t@1\n" })
  assert.deepEqual(await tmux.windows.find("work", "B"), { name: "B", id: "@2" })
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

test("sendText waits for seat quiet, then clears, pastes through a private buffer, presses Enter N times, and cleans up", async() => {
  const { tmux, calls } = fakeTmux()
  await tmux.input.sendText("@2", "hello")
  const verbs = calls.map((args) => args[0])
  assert.deepEqual(verbs.slice(0, 9), Array(9).fill("capture-pane"), "one arming sample plus eight steady ones")
  assert.deepEqual(verbs.slice(9), [
    "send-keys", "set-buffer", "paste-buffer", "send-keys", "send-keys", "delete-buffer",
  ])
  const buffer = calls[10]![2]
  assert.deepEqual(calls[10]!.slice(3), ["--", "hello"])
  assert.deepEqual(calls[11], ["paste-buffer", "-b", buffer, "-d", "-p", "-t", "@2"])
  assert.deepEqual(calls[12], ["send-keys", "-t", "@2", "Enter"])
})

test("sendText with quiet false skips the gate for urgent delivery", async() => {
  const { tmux, calls } = fakeTmux()
  await tmux.input.sendText("@2", "now", { quiet: false })
  assert.deepEqual(calls.map((args) => args[0]), [
    "send-keys", "set-buffer", "paste-buffer", "send-keys", "send-keys", "delete-buffer",
  ])
})

test("capture asks for the last N lines and joins wrapped lines on request", async() => {
  const { tmux, calls } = fakeTmux({ "capture-pane": "line\n" })
  assert.equal(await tmux.screen.capture("@2", 40, true), "line\n")
  assert.deepEqual(calls[0], ["capture-pane", "-p", "-t", "@2", "-S", "-40", "-J"])
  await tmux.screen.capture("@2", 5, false)
  assert.deepEqual(calls[1], ["capture-pane", "-p", "-t", "@2", "-S", "-5"])
})

test("panes.stamp writes only what differs and clears sibling stamps in the same window", async() => {
  const { tmux, calls } = fakeTmux()
  const live: LivePane[] = [
    { session: "s", window: "A", windowId: "@1", pane: "%1", index: 0, pid: 1, agent: "A" },
    { session: "s", window: "A", windowId: "@1", pane: "%2", index: 1, pid: 2, agent: undefined },
    { session: "s", window: "B", windowId: "@2", pane: "%3", index: 0, pid: 3, agent: "B" },
  ]
  await tmux.panes.stamp("%2", live, { agent: "A", harness: "claude" })
  const writes = calls.map((args) => args.join(" ")).sort()
  assert.deepEqual(writes, [
    "set-option -p -t %1 -u @ttt_agent",
    "set-option -p -t %2 @ttt_agent A",
    "set-option -p -t %2 @ttt_harness claude",
  ], "sibling %1 is cleared, window B is untouched")
  calls.length = 0
  await tmux.panes.stamp("%1", live.map((pane) => pane.pane === "%2" ? { ...pane, agent: "A" } : { ...pane, agent: undefined }), { agent: "A" })
  assert.deepEqual(calls.map((args) => args.join(" ")).sort(), [
    "set-option -p -t %1 @ttt_agent A",
    "set-option -p -t %2 -u @ttt_agent",
  ])
  calls.length = 0
  await tmux.panes.stamp("%1", live, { agent: "A" })
  assert.deepEqual(calls, [], "an already-correct stamp costs nothing")
})

test("waitForQuiet proceeds after enough steady samples", async() => {
  let captures = 0
  const tmux = new Tmux(NO_WAIT, async(args) => {
    if (args[0] === "capture-pane") {
      captures += 1
      return "idle screen"
    }
    return ""
  })
  await tmux.screen.waitForQuiet("%1", { sampleMs: 1, samples: 3 })
  assert.equal(captures, 4, "first sample arms, three steady ones open the gate")
})

test("waitForQuiet restarts the run on change and gives up at the cap", async() => {
  let captures = 0
  const tmux = new Tmux(NO_WAIT, async(args) => {
    if (args[0] === "capture-pane") {
      captures += 1
      return captures === 3 ? "changed" : "idle screen"
    }
    return ""
  })
  await tmux.screen.waitForQuiet("%1", { sampleMs: 1, samples: 3 })
  assert.equal(captures, 7, "arming + two steady, change, re-arm + three steady")
  let spinning = 0
  const busy = new Tmux(NO_WAIT, async(args) => {
    if (args[0] === "capture-pane") {
      spinning += 1
      return `frame ${spinning}`
    }
    return ""
  })
  const started = Date.now()
  await busy.screen.waitForQuiet("%1", { sampleMs: 1, samples: 100, capMs: 30 })
  assert.ok(Date.now() - started < 5_000, "the cap ends the wait")
})
