import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"

import { SkillState, skillInstalls } from "../src/skill-status.ts"

const homes: string[] = []
after(async() => {
  for (const home of homes) await rm(home, { recursive: true, force: true })
})

test("skillInstalls reports symlink, copy, broken, and missing per harness without writing", async() => {
  const home = await mkdtemp(join(tmpdir(), "ttt-skill-"))
  homes.push(home)
  const checkout = join(home, "checkout", "skills", "ttt")
  await mkdir(checkout, { recursive: true })
  await writeFile(join(checkout, "SKILL.md"), "---\nname: ttt\nversion: 9.9.9\n---\n# ttt\n")
  await mkdir(join(home, ".agents", "skills"), { recursive: true })
  await symlink(checkout, join(home, ".agents", "skills", "ttt"))
  await mkdir(join(home, ".claude", "skills", "ttt"), { recursive: true })
  await writeFile(join(home, ".claude", "skills", "ttt", "SKILL.md"), "---\nname: ttt\n---\nno version here\n")
  await mkdir(join(home, ".codex", "skills"), { recursive: true })
  await symlink(join(home, "gone"), join(home, ".codex", "skills", "ttt"))

  const byHarness = new Map((await skillInstalls(home)).map((install) => [install.harness, install]))
  assert.equal(byHarness.get("universal")?.state, SkillState.Symlink)
  assert.equal(byHarness.get("universal")?.version, "9.9.9")
  assert.equal(byHarness.get("universal")?.target, checkout)
  assert.equal(byHarness.get("claude-code")?.state, SkillState.Copy)
  assert.equal(byHarness.get("claude-code")?.version, undefined)
  assert.equal(byHarness.get("codex")?.state, SkillState.Broken)
  assert.equal(byHarness.get("opencode")?.state, SkillState.Missing)
  assert.equal(byHarness.get("cursor")?.state, SkillState.Missing)
})
