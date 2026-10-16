import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"

import { Board, MessageKind, MessagePriority } from "@ttt/board"
import { Tmux, UserOption } from "@ttt/tmux"
import type { TmuxOptions } from "@ttt/tmux"

import { notify, pushUrgent } from "../src/commands/notify.ts"
import type { Context } from "../src/context.ts"
import { defaultSettings } from "../src/settings.ts"

const homes: string[] = []
after(async() => {
  for (const home of homes) await rm(home, { recursive: true, force: true })
})

const NO_WAIT: TmuxOptions = { inputSettleMs: 0, postPasteMs: 0, enterPresses: 1, postSendMs: 0 }

for (const action of ["arrival", "read", "wait", "replacement"] as const) {
  test(`mailbox stays available during screen quiet; delivery rechecks ${action}`, async() => {
    const home = await mkdtemp(join(tmpdir(), "ttt-notify-"))
    homes.push(home)
    const sessionRoot = join(home, "boards", "work")
    const board = new Board({ sessionRoot, notifySeconds: 0, lock: { timeoutMs: 200, staleMs: 60_000 } })
    const options = { kind: MessageKind.Message, priority: MessagePriority.Normal, replyExpected: true }
    const first = await board.send("A", ["B"], "first", options)
    const token = first.notifications[0]!.token
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const pasted: string[] = []
    const tmux = new Tmux(NO_WAIT, async(args) => {
      if (args[0] === "list-windows") return "B\t@2\n"
      if (args[0] === "list-panes") return "work\tB\t@2\t%5\t1\t1234\tB\n"
      if (args[0] === "show-options") return ""
      if (args[0] === "capture-pane") {
        entered.resolve()
        await release.promise
        return "steady"
      }
      if (args[0] === "set-buffer") pasted.push(args.at(-1)!)
      return ""
    })
    const ctx: Context = {
      settings: defaultSettings(home), session: "work", senderName: "ttt", windowName: "ttt",
      senderId: "", senderPane: "", claimed: false, actor: undefined, via: "override",
      tmux, board, binPath: join(home, "no-such-bin.mjs"),
    }
    const delivering = notify(["--target", "B", "--token", token], ctx)
    let withdraw: (() => Promise<void>) | undefined
    let replacement: string | undefined
    try {
      await entered.promise
      // These operations must finish while the screen gate is still blocked, not after it opens.
      await board.ack("B", first.message.messageId, "done while screen busy")
      await board.send("A", ["B"], "second", options)
      if (action === "read") await board.read("B", { max: 10, peek: false, latest: false })
      if (action === "wait") withdraw = await board.announcePresence("B", "any")
      if (action === "replacement") {
        await board.cancelNotification("B", token)
        replacement = (await board.scheduleNotification("B"))!.token
      }
    } finally {
      release.resolve()
      await delivering
      await withdraw?.()
    }
    assert.deepEqual(pasted, action === "arrival" ? ["ttt: 1 new from A(1); 1 unread. Run: ttt read"] : [])
    if (replacement) {
      const marker = JSON.parse(await readFile(join(sessionRoot, "state", "B.notification.json"), "utf8")) as { token: string }
      assert.equal(marker.token, replacement, "the stale notifier leaves the replacement token alone")
    }
  })
}

/** A tmux server that lists window B but fails every paste. */
function failingTmux(): Tmux {
  return new Tmux(NO_WAIT, async(args) => {
    if (args[0] === "list-windows") return "B\t@2\n"
    throw new Error("pane gone")
  })
}

test("a failed paste re-arms a live marker instead of stranding the burst", async() => {
  const home = await mkdtemp(join(tmpdir(), "ttt-notify-"))
  homes.push(home)
  const sessionRoot = join(home, "boards", "work")
  const board = new Board({ sessionRoot, notifySeconds: 0, lock: { timeoutMs: 2_000, staleMs: 60_000 } })
  const sent = await board.send("A", ["B"], "hi", {
    kind: MessageKind.Message,
    priority: MessagePriority.Normal,
    replyExpected: true,
  })
  const token = sent.notifications[0]!.token
  const ctx: Context = {
    settings: defaultSettings(home),
    session: "work",
    senderName: "ttt",
    windowName: "ttt",
    senderId: "",
    senderPane: "",
    claimed: false,
    actor: undefined,
    via: "override",
    tmux: failingTmux(),
    board,
    binPath: join(home, "no-such-bin.mjs"),
  }
  await notify(["--target", "B", "--token", token], ctx)
  const marker = JSON.parse(await readFile(join(sessionRoot, "state", "B.notification.json"), "utf8")) as { token: string }
  assert.notEqual(marker.token, token, "a fresh token owns the burst after the failed paste")
  assert.equal(await board.unreadCount("B"), 1, "the message stays unread")
})

/** A tmux server that seats B in %5 but counts every paste, and stamps `@ttt_gui` when `gui` is set. */
function countingTmux(pasted: { count: number }, gui = false): Tmux {
  return new Tmux(NO_WAIT, async(args) => {
    if (args[0] === "list-windows") return "B\t@2\n"
    if (args[0] === "list-panes") return "work\tB\t@2\t%5\t1\t1234\tB\n"
    if (args[0] === "show-options") return gui && args.includes(UserOption.Gui) ? "1\n" : ""
    if (args[0] === "load-buffer" || args[0] === "paste-buffer" || args[0] === "send-keys") {
      pasted.count += 1
      return ""
    }
    throw new Error(`unexpected tmux call: ${args[0]}`)
  })
}

test("a notifier that fires while the target waits pastes nothing and drops the marker", async() => {
  const home = await mkdtemp(join(tmpdir(), "ttt-notify-"))
  homes.push(home)
  const sessionRoot = join(home, "boards", "work")
  const board = new Board({ sessionRoot, notifySeconds: 0, lock: { timeoutMs: 2_000, staleMs: 60_000 } })
  const sent = await board.send("A", ["B"], "hi", {
    kind: MessageKind.Message,
    priority: MessagePriority.Normal,
    replyExpected: true,
  })
  const token = sent.notifications[0]!.token
  const withdraw = await board.announcePresence("B", "any")
  const pasted = { count: 0 }
  const ctx: Context = {
    settings: defaultSettings(home),
    session: "work",
    senderName: "ttt",
    windowName: "ttt",
    senderId: "",
    senderPane: "",
    claimed: false,
    actor: undefined,
    via: "override",
    tmux: countingTmux(pasted),
    board,
    binPath: join(home, "no-such-bin.mjs"),
  }
  await notify(["--target", "B", "--token", token], ctx)
  assert.equal(pasted.count, 0, "the waiter delivers its own mail")
  await assert.rejects(readFile(join(sessionRoot, "state", "B.notification.json"), "utf8"), "the marker is dropped")
  assert.equal(await board.unreadCount("B"), 1, "the message stays unread and unnotified")
  await withdraw()
})

test("a gui seat swallows the batched paste and its marker without a re-arm", async() => {
  const home = await mkdtemp(join(tmpdir(), "ttt-notify-"))
  homes.push(home)
  const sessionRoot = join(home, "boards", "work")
  const board = new Board({ sessionRoot, notifySeconds: 0, lock: { timeoutMs: 2_000, staleMs: 60_000 } })
  const sent = await board.send("A", ["B"], "hi", {
    kind: MessageKind.Message,
    priority: MessagePriority.Normal,
    replyExpected: true,
  })
  const token = sent.notifications[0]!.token
  const pasted = { count: 0 }
  const ctx: Context = {
    settings: defaultSettings(home),
    session: "work",
    senderName: "ttt",
    windowName: "ttt",
    senderId: "",
    senderPane: "",
    claimed: false,
    actor: undefined,
    via: "override",
    tmux: countingTmux(pasted, true),
    board,
    binPath: join(home, "no-such-bin.mjs"),
  }
  await notify(["--target", "B", "--token", token], ctx)
  assert.equal(pasted.count, 0, "a gui seat has no reader on its pane")
  await assert.rejects(readFile(join(sessionRoot, "state", "B.notification.json"), "utf8"), "the marker is cancelled, not re-armed")
  assert.equal(await board.unreadCount("B"), 1, "the message waits unread for a background read")
})

test("an urgent paste is skipped for a gui seat and the mail waits unread", async() => {
  const home = await mkdtemp(join(tmpdir(), "ttt-notify-"))
  homes.push(home)
  const sessionRoot = join(home, "boards", "work")
  const board = new Board({ sessionRoot, notifySeconds: 0, lock: { timeoutMs: 2_000, staleMs: 60_000 } })
  const sent = await board.send("A", ["B"], "now", {
    kind: MessageKind.Message,
    priority: MessagePriority.Urgent,
    replyExpected: true,
  })
  const message = sent.message
  const pasted = { count: 0 }
  const ctx: Context = {
    settings: defaultSettings(home),
    session: "work",
    senderName: "A",
    windowName: "A",
    senderId: "",
    senderPane: "",
    claimed: false,
    actor: undefined,
    via: "override",
    tmux: countingTmux(pasted, true),
    board,
    binPath: join(home, "no-such-bin.mjs"),
  }
  await pushUrgent(ctx, message, new Map([["B", {
    window: { id: "@2", name: "B" },
    seat: { windowId: "@2", windowName: "B", paneId: "%5", registered: false },
  }]]))
  assert.equal(pasted.count, 0, "urgent cannot wake a gui seat either")
  assert.equal(await board.unreadCount("B"), 1, "the message waits unread for a background read")
})
