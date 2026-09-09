import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"

import { Board, MessageKind, MessagePriority } from "@ttt/board"
import { Tmux } from "@ttt/tmux"
import type { TmuxOptions } from "@ttt/tmux"

import { notify } from "../src/commands/notify.ts"
import type { Context } from "../src/context.ts"
import { defaultSettings } from "../src/settings.ts"

const homes: string[] = []
after(async() => {
  for (const home of homes) await rm(home, { recursive: true, force: true })
})

const NO_WAIT: TmuxOptions = { inputSettleMs: 0, postPasteMs: 0, enterPresses: 1, postSendMs: 0 }

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

/** A tmux server that seats B in %5 but counts every paste. */
function countingTmux(pasted: { count: number }): Tmux {
  return new Tmux(NO_WAIT, async(args) => {
    if (args[0] === "list-windows") return "B\t@2\n"
    if (args[0] === "list-panes") return "work\tB\t@2\t%5\t1\t1234\tB\n"
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
