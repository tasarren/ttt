import { test } from "node:test"
import assert from "node:assert/strict"
import { orderedMessages, summarizeReceipts, receiptRows, timeline, groupProjects } from "../src/contracts/selectors.ts"
import { checksum, parseLayout, serializeLayout, makeLayout, splitPane, removePane, resizeSplit, leafCount } from "../src/contracts/layout.ts"
import { validateLayoutSemantics, validateSettingsSemantics } from "../src/contracts/semantics.ts"

test("thread order follows index, not timestamp", () => {
  const messages = [{ messageId: "a", timestamp: "2026-09-25T14:00:00Z" }, { messageId: "b", timestamp: "2026-09-25T13:00:00Z" }]
  assert.deepEqual(orderedMessages(["a", "b"], messages as never).map(x => x.messageId), ["a", "b"])
})
test("missing receipt is not a sixth state and zero remains zero", () => {
  const rows = receiptRows({ message: { recipients: ["a", "b"] }, receipts: [{ recipient: "a", state: "acked" }] } as never)
  assert.equal(rows[1]!.receipt, undefined)
  assert.deepEqual(summarizeReceipts([{ state: "acked" }] as never), { unread: 0, read: 0, acked: 1, superseded: 0, cancelled: 0 })
})
test("timestamp projections never invent history", () => {
  const events = timeline([{ messageId: "a", timestamp: "2026-09-25T14:00:00Z", from: "planner", kind: "message", body: "a" }] as never, [])
  assert.equal(events.length, 1)
  assert.equal(events[0]!.type, "message")
})
test("derived projects group existing cwd without persisted project states", () => {
  assert.deepEqual(groupProjects([]), [])
})
test("tmux layouts round trip with verified checksum", () => {
  const tree = makeLayout(3)
  const encoded = serializeLayout(tree)
  assert.equal(encoded.slice(0, 4), checksum(encoded.slice(5)))
  assert.deepEqual(parseLayout(encoded), tree)
  assert.throws(() => parseLayout("0000," + encoded.slice(5)), /checksum/)
})
test("split/remove preserves geometry and at least one pane", () => {
  const initial = makeLayout(1)
  const split = splitPane(initial, 0, "horizontal")
  assert.equal(leafCount(split), 2)
  assert.equal(leafCount(removePane(split, 1)), 1)
  assert.throws(() => removePane(initial, 0), /last pane/)
  assert.equal(leafCount(resizeSplit(split, [], 0.6)), 2)
})
test("layout semantic rules reject names, titles on agents and missing geometry", () => {
  const errors = validateLayoutSemantics({ version: 1, windows: [{ name: "bad name", panes: [{ agent: true, title: "bad" }, {}] }] })
  assert.ok(errors.some(x => x.includes("name")))
  assert.ok(errors.some(x => x.includes("title")))
  assert.ok(errors.some(x => x.includes("layout")))
})
test("settings preserve zero, reject invalid harness defaults", () => {
  assert.deepEqual(validateSettingsSemantics({ notifySeconds: 0 }), [])
  assert.ok(validateSettingsSemantics({ harnesses: { local: { bin: "node", ready: "ready" } } }).length)
  assert.deepEqual(validateSettingsSemantics({ harnesses: { local: { bin: "node", ready: "ready", default: true } } }), [])
})
test("layout round trips for all supported pane counts",()=>{
  for (let n = 1;n <= 24;n++) {
    const tree = makeLayout(n)
    assert.equal(leafCount(parseLayout(serializeLayout(tree))),n)
  }
})
test("invalid split geometry is rejected even with a valid checksum",()=>{
  const body = "160x48,0,0{20x48,0,0,0,20x48,21,0,1}"
  assert.throws(()=>parseLayout(checksum(body) + "," + body),/dimensions/)
})
test("unspecified uniqueness rules do not reject schema-valid agent values",()=>{
  const l = { version: 1 as const,windows: [{ name: "main",layout: serializeLayout(makeLayout(2)),panes: [{ agent: true },{ agent: "main" }] }] }
  assert.deepEqual(validateLayoutSemantics(l),[])
})
test("malformed regular expressions are reported without executing them",()=>{
  const errors = validateSettingsSemantics({ harnesses: { local: { bin: "node",ready: "[",default: true } } })
  assert.ok(errors.some(e=>e.includes("regular expression")))
})
test("layout operations accept reactive-style proxies without mutation",()=>{
  const raw = makeLayout(1)
  const proxy = new Proxy(raw,{})
  assert.equal(leafCount(splitPane(proxy,0,"horizontal")),2)
  assert.equal(leafCount(raw),1)
})

test("adjacent separators resize three-child splits without moving other panes", () => {
  const tree = { width: 160, height: 48, x: 0, y: 0, direction: "horizontal" as const, children: [
    { width: 52, height: 48, x: 0, y: 0, pane: 0 },
    { width: 53, height: 48, x: 53, y: 0, pane: 1 },
    { width: 53, height: 48, x: 107, y: 0, pane: 2 },
  ] }
  const updated = resizeSplit(tree, [], 0.7, 1)
  assert.equal(updated.children![0]!.width, 52)
  assert.notEqual(updated.children![1]!.width, 53)
  assert.equal(updated.children![1]!.x, 53)
  assert.deepEqual(parseLayout(serializeLayout(updated)), updated)
  assert.equal(tree.children[1]!.width, 53)
})

test("unknown shipped-harness metadata does not invalidate a schema-valid preset", () => {
  const value = { harnesses: { shipped: { default: true } } }
  assert.deepEqual(validateSettingsSemantics(value), [])
  assert.deepEqual(validateSettingsSemantics(value, ["shipped"]), [])
  assert.ok(validateSettingsSemantics(value, []).some(error => error.includes("bin and ready")))
})
