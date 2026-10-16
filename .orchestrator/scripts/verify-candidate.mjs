// Verify current tracked + unignored files from scratch without changing Git refs or the index.
// Usage: node verify-candidate.mjs [/absolute/path/to/node]
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { cp, lstat, mkdir, mkdtemp } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../", import.meta.url))
const runtime = process.argv[2] ? resolve(process.argv[2]) : process.execPath
const tmp = join(root, ".orchestrator/tmp")
await mkdir(tmp, { recursive: true })
const work = await mkdtemp(join(tmp, "c-"))
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean)
for (const path of new Set(files)) {
  assert.ok(!path.startsWith(".orchestrator/tmp/") && !path.includes("node_modules/"), "scratch or dependencies must not enter the snapshot")
  try { await lstat(join(root, path)) } catch (error) { if (error.code === "ENOENT") continue; throw error }
  await mkdir(dirname(join(work, path)), { recursive: true })
  await cp(join(root, path), join(work, path), { verbatimSymlinks: true })
}
await mkdir(join(work, ".orchestrator/tmp"), { recursive: true })
process.stdout.write(`Clean candidate snapshot: ${work}\n`)
const run = (...args) => execFileSync("env", [`PATH=${dirname(runtime)}:${process.env.PATH}`, `TMPDIR=${work}/.orchestrator/tmp`, "corepack", "pnpm@11.24.0", ...args], { cwd: work, stdio: "inherit" })
run("install", "--frozen-lockfile")
run("run", "check")
run("--filter", "@tasarren/ttt", "pack", "--dry-run")
process.stdout.write(`Clean candidate passed on ${execFileSync(runtime, ["--version"], { encoding: "utf8" }).trim()}\n`)
