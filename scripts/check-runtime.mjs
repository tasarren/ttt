import assert from "node:assert/strict"

/** Oldest supported development toolchain. Newer is accepted: these are floors, not locks. */
const minNode = "26.8.1"
const minPnpm = "11.24.0"

/** Numeric components of a version, ignoring any prerelease suffix (`26.9.0-rc.1` -> [26, 9, 0]). */
function parts(version) {
  return version.split("-")[0].split(".").map(Number)
}

/** Whether `version` is at least `minimum`, component-wise (a missing component counts as 0). */
function atLeast(version, minimum) {
  const current = parts(version)
  const floor = parts(minimum)
  for (let i = 0; i < Math.max(current.length, floor.length); i += 1) {
    const left = current[i] ?? 0
    const right = floor[i] ?? 0
    if (left !== right) return left > right
  }
  return true
}

const node = process.versions.node
assert.ok(atLeast(node, minNode), `Node >= ${minNode} is required (running ${node})`)

const userAgent = process.env.npm_config_user_agent ?? ""
const pnpm = /^pnpm\/([^\s]+)/.exec(userAgent)?.[1]
assert.ok(pnpm !== undefined, `pnpm >= ${minPnpm} is required (run through pnpm, not npm or node directly)`)
assert.ok(atLeast(pnpm, minPnpm), `pnpm >= ${minPnpm} is required (running ${pnpm})`)
