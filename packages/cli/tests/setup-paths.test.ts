import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { copyFile, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"

const exec = promisify(execFile)
const BIN = new URL("../src/ttt.ts", import.meta.url).pathname

test("setup hook treats executable paths as literal shell arguments and tmux formats", async() => {
  const root = await mkdtemp(join(tmpdir(), "ttt-hook-"))
  const socket = `ttt-hook-${process.pid}`
  const tmux = async(...args: string[]): Promise<string> => (await exec("tmux", ["-L", socket, ...args], { cwd: root })).stdout.trim()
  try {
    const odd = join(root, "space ' \"$HOME\" $(touch INJECTED) `touch BACKTICK` ; # #{session_name}")
    await mkdir(odd)
    const node = join(odd, "node")
    const bin = join(odd, "ttt.mjs")
    await copyFile(process.execPath, node) // A symlink would resolve process.execPath back to the ordinary path.
    await symlink(BIN, bin)
    await writeFile(join(root, "settings.jsonc"), "{}")
    await tmux("-f", "/dev/null", "new-session", "-d", "-s", "anchor", "sh")
    const socketPath = await tmux("display-message", "-p", "#{socket_path}")
    const env: NodeJS.ProcessEnv = { ...process.env, TTT_HOME: root, TMUX: `${socketPath},0,0` }
    delete env["TMUX_PANE"]
    await exec(node, [bin, "tmux", "setup", "--name", "quoted", "--cwd", root, "--non-interactive"], { env, cwd: root })
    const window = await tmux("new-window", "-t", "quoted", "-P", "-F", "#{window_id}", "sh")
    assert.equal(await tmux("display-message", "-p", "-t", window, "#{window_name}"), "W-1")
    assert.equal(await tmux("show-options", "-wA", "-v", "-t", window, "remain-on-exit"), "on")
    assert.equal(await tmux("show-options", "-wA", "-v", "-t", window, "allow-rename"), "off")
    assert.deepEqual((await readdir(root)).sort(), ["sessions", "settings.jsonc", odd.slice(root.length + 1)].sort(), "path text never ran as shell syntax")
  } finally {
    await tmux("kill-server").catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
})
