import { lstat, readFile, readlink, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

/** Global skill directories of the harnesses `npx skills` and `skills-npm` install into. */
const SKILL_DIRS: ReadonlyArray<readonly [harness: string, dir: string]> = [
  ["universal", ".agents/skills"],
  ["claude-code", ".claude/skills"],
  ["codex", ".codex/skills"],
  ["opencode", ".config/opencode/skills"],
  ["cursor", ".cursor/skills"],
  ["gemini-cli", ".gemini/skills"],
  ["github-copilot", ".copilot/skills"],
]

export const SkillState = {
  Symlink: "symlink",
  Copy: "copy",
  /** A symlink whose target no longer exists. */
  Broken: "broken",
  Missing: "missing",
} as const
export type SkillState = (typeof SkillState)[keyof typeof SkillState]

export interface SkillInstall {
  harness: string
  path: string
  state: SkillState
  /** `version:` from the installed SKILL.md frontmatter; undefined when missing or unversioned. */
  version: string | undefined
  /** Where a symlink points. */
  target?: string
}

/** Read-only: where a `ttt` skill is installed and which version it carries. Never writes. */
export async function skillInstalls(home: string = homedir()): Promise<SkillInstall[]> {
  const installs: SkillInstall[] = []
  for (const [harness, dir] of SKILL_DIRS) {
    const path = join(home, dir, "ttt")
    installs.push(await inspect(harness, path))
  }
  return installs
}

async function inspect(harness: string, path: string): Promise<SkillInstall> {
  let link: string | undefined
  try {
    const info = await lstat(path)
    if (info.isSymbolicLink()) link = await readlink(path)
  } catch {
    // Not installed for this harness; the common case, not an error.
    return { harness, path, state: SkillState.Missing, version: undefined }
  }
  const version = await readVersion(join(path, "SKILL.md"))
  if (link === undefined) return { harness, path, state: SkillState.Copy, version }
  try {
    await stat(path)
  } catch {
    // lstat saw the link, stat cannot follow it: the target is gone.
    return { harness, path, state: SkillState.Broken, version: undefined, target: link }
  }
  return { harness, path, state: SkillState.Symlink, version, target: link }
}

async function readVersion(file: string): Promise<string | undefined> {
  try {
    const text = await readFile(file, "utf8")
    return /^version:\s*(\S+)\s*$/m.exec(text.split("\n---")[0] ?? "")?.[1]
  } catch {
    // A skill directory without a readable SKILL.md reports as unversioned; doctor says so.
    return undefined
  }
}
