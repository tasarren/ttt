import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"

import { Board, MessageKind, MessagePriority } from "@ttt/board"
import type { SendOptions } from "@ttt/board"

import { CURRENT_SCHEMA_VERSION, MIGRATION_STEPS, migrateSession } from "../src/index.ts"

const roots: string[] = []
after(async() => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

const NORMAL: SendOptions = { kind: MessageKind.Message, priority: MessagePriority.Normal, replyExpected: true }
const LOCK = { timeoutMs: 2_000, staleMs: 60_000 }

async function oldBoard(): Promise<string> {
  const sessionRoot = await mkdtemp(join(tmpdir(), "ttt-migrate-"))
  roots.push(sessionRoot)
  const board = new Board({ sessionRoot, notifySeconds: 0, lock: LOCK })
  const first = await board.send("A", ["B"], "q", NORMAL)
  await board.send("B", ["A"], "a", { ...NORMAL, kind: MessageKind.Reply, inReplyTo: first.message.messageId })
  // Simulate a pre-index board: the index did not exist before v5.
  await rm(join(sessionRoot, "threads"), { recursive: true, force: true })
  return sessionRoot
}

test("manifest holds ordered steps ending at the current version", () => {
  assert.deepEqual(MIGRATION_STEPS.map((step) => [step.from, step.to]), [[4, 5], [5, 6]])
  assert.equal(CURRENT_SCHEMA_VERSION, 6)
})

test("dry-run counts without writing; migrate indexes and ledgers; reruns are no-ops", async() => {
  const sessionRoot = await oldBoard()
  const boards = { sessionRoot, lock: LOCK }
  const unmigrated = new Board({ sessionRoot, notifySeconds: 0, lock: LOCK })
  const anyId = (await unmigrated.read("B", { max: 1, peek: true, latest: false })).messages[0]!.messageId
  await assert.rejects(unmigrated.thread(anyId), /run ttt migrate/)
  const dry = await migrateSession(boards, { dryRun: true })
  assert.equal(dry.from, 4)
  assert.equal(dry.to, 6)
  assert.equal(dry.threads, 1)
  assert.equal(dry.mailboxes, 2)
  assert.equal((await migrateSession(boards, { dryRun: true })).threads, 1, "dry-run writes nothing")

  const done = await migrateSession(boards, { dryRun: false })
  assert.deepEqual([done.threads, done.mailboxes], [1, 2])
  const again = await migrateSession(boards, { dryRun: false })
  assert.equal(again.from, 6)
  assert.equal(again.to, 6)
  assert.equal(again.threads, 0)

  const board = new Board({ sessionRoot, notifySeconds: 0, lock: LOCK })
  assert.equal(await board.schemaVersion(), 6)
  assert.equal((await board.thread((await board.read("A", { max: 10, peek: true, latest: false })).messages[0]!.messageId)).length, 2)
})

test("newer-than-code boards are refused, not guessed", async() => {
  const sessionRoot = await oldBoard()
  const board = new Board({ sessionRoot, notifySeconds: 0, lock: LOCK })
  await board.setSchemaVersion(99)
  await assert.rejects(migrateSession({ sessionRoot, lock: LOCK }, { dryRun: false }), /newer than this ttt/)
})
