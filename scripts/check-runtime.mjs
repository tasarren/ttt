import assert from "node:assert/strict"

const expectedNode = "26.8.1"
const expectedPnpm = "11.24.0"
const userAgent = process.env.npm_config_user_agent ?? ""

assert.equal(process.versions.node, expectedNode, `Node ${expectedNode} is required`)
assert.ok(userAgent.startsWith(`pnpm/${expectedPnpm} `), `pnpm ${expectedPnpm} is required`)
