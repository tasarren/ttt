// No registry writes. Validate the exact tag before the release job checks and stages its checkout.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import "./sync-version.mjs"

const root = fileURLToPath(new URL("../../", import.meta.url))
const pkg = JSON.parse(await readFile(new URL("../../packages/cli/package.json", import.meta.url), "utf8"))
const tag = process.argv[2]
assert.match(pkg.version, /^\d+\.\d+\.\d+$/, "only stable package versions may be staged")
assert.equal(tag, `v${pkg.version}`, `tag ${tag} != package v${pkg.version}`)
const rev = (ref) => execFileSync("git", ["rev-parse", "--verify", ref], { cwd: root, encoding: "utf8" }).trim()
assert.equal(rev(`${tag}^{commit}`), rev("HEAD"), "release tag must identify the checked-out commit")
process.stdout.write(`Release preflight passed: ${tag} at ${rev("HEAD")}\n`)
