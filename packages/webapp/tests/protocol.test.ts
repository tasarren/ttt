import { test } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { Ajv2020 } from "ajv/dist/2020.js"
import formats from "ajv-formats"
import { serializeState, isWebState, isTerminalEvent, ACTION_SCHEMA } from "../src/protocol.ts"
import type { WebState } from "../src/protocol.ts"
import { render } from "../src/ssr.ts"

const initial: WebState = { boards: [], board: null, sessions: [], geometry: {}, layouts: {}, settings: { value: {}, source: "{}", etag: "empty" }, harnesses: [], findings: [], page: { offset: 0, limit: 50, total: 0 }, token: "test-token", revision: 0 }

test("HTTP/SSE spec validates transport and SSR stays isolated", async() => {
  const api: unknown = JSON.parse(await readFile(new URL("../openapi.json", import.meta.url), "utf8"))
  const domain: unknown = JSON.parse(await readFile(new URL("../../../docs/ttt-system.schema.json", import.meta.url), "utf8"))
  const validator = new Ajv2020({ strict: false })
  formats(validator)
  validator.addSchema(domain as object, "https://ttt.local/docs/ttt-system.schema.json")
  validator.addSchema(api as object, "https://ttt.local/packages/webapp/openapi.json")
  const state = validator.compile({ $ref: "https://ttt.local/packages/webapp/openapi.json#/components/schemas/WebState" })
  assert.ok(state(initial), JSON.stringify(state.errors))
  assert.ok(isWebState(initial))
  assert.ok(!isWebState({ ...initial, settings: { ...initial.settings, value: { invented: true } } }))
  const action = validator.compile(ACTION_SCHEMA)
  assert.ok(action({ action: "close", session: "test", target: "window" }))
  assert.ok(!action({ action: "close", session: "test", arbitrary: true }))
  assert.ok(isTerminalEvent({ type: "snapshot", pane: "%1", frame: { epoch: 1, text: "shell", cols: 80, rows: 24 } }))
  assert.ok(!isTerminalEvent({ type: "snapshot", pane: "bad", frame: { epoch: 1, text: "shell", cols: 0, rows: 0 } }))
  assert.equal(serializeState({ body: "</script><script>alert(1)</script>" }).includes("<"), false)
  const first = await render("/settings", initial)
  const second = await render("/boards", { ...initial, token: "another" })
  assert.ok(first.includes("Configuration") || first.includes("Settings"))
  assert.ok(second.includes("No board data"))
  assert.ok(!second.includes("another"))
})
