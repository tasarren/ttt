import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { Board } from "../src/board.ts"
import { MessageKind, MessagePriority } from "../src/model.ts"

test("observation leaves expired unread receipts and every board file unchanged", async() => {
  const root = await mkdtemp(join(tmpdir(), "ttt-observe-"))
  try {
    const board = new Board({ sessionRoot: root, notifySeconds: 20, lock: { timeoutMs: 1000, staleMs: 1000 } })
    await board.send("sender", ["receiver"], "expired", { kind: MessageKind.Message, priority: MessagePriority.Normal, replyExpected: false, ttlMs: 100 })
    await delay(120)
    const files = async() => {
      const rows = await readdir(root, { recursive: true, withFileTypes: true })
      return Object.fromEntries(await Promise.all(rows.filter(row => row.isFile()).map(async row => [join(row.parentPath, row.name), await readFile(join(row.parentPath, row.name), "utf8")] as const)))
    }
    const before = await files()
    const state = await board.observe()
    assert.equal(state.receipts[0]?.state, "unread")
    assert.equal(state.messages.length, 1)
    assert.deepEqual(await files(), before)
  } finally { await rm(root, { recursive: true, force: true }) }
})
