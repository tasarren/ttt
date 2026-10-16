import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const exec = promisify(execFile)
const root = fileURLToPath(new URL("../../../", import.meta.url))

test("release preflight rejects wrong tags, stale versions, and a tag on another commit", async() => {
  await mkdir(join(root, ".orchestrator/tmp"), { recursive: true })
  const work = await mkdtemp(join(root, ".orchestrator/tmp/release-guard-"))
  try {
    for (const path of [".orchestrator/scripts", "packages/cli/src", "skills/ttt"]) await mkdir(join(work, path), { recursive: true })
    for (const path of [".orchestrator/scripts/verify-release.mjs", ".orchestrator/scripts/sync-version.mjs", "packages/cli/package.json", "packages/cli/src/version.ts", "skills/ttt/SKILL.md"]) await cp(join(root, path), join(work, path))
    const pkg = JSON.parse(await readFile(join(work, "packages/cli/package.json"), "utf8")) as { version: string }
    const git = async(...args: string[]): Promise<void> => { await exec("git", ["-c", "user.name=Release test", "-c", "user.email=test@localhost", ...args], { cwd: work }) }
    const verify = async(tag: string): Promise<string> => (await exec(process.execPath, [".orchestrator/scripts/verify-release.mjs", tag], { cwd: work })).stdout
    await git("init", "--quiet")
    await git("add", ".")
    await git("commit", "--quiet", "-m", "fixture")
    await git("tag", `v${pkg.version}`)
    assert.match(await verify(`v${pkg.version}`), /Release preflight passed/)
    await assert.rejects(verify("v9.9.9"), /!= package/)
    await assert.rejects(verify(pkg.version), /!= package/)
    await writeFile(join(work, "packages/cli/src/version.ts"), "stale")
    await assert.rejects(verify(`v${pkg.version}`), /is stale/)
    await git("add", ".")
    await git("commit", "--quiet", "-m", "different commit")
    await cp(join(root, "packages/cli/src/version.ts"), join(work, "packages/cli/src/version.ts"))
    await assert.rejects(verify(`v${pkg.version}`), /release tag must identify the checked-out commit/)
  } finally {
    await rm(work, { recursive: true, force: true })
  }
})
