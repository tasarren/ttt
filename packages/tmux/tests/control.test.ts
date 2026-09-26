import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"
import { ControlClient, controlBytes } from "../src/control.ts"

test("control blocks preserve pane IDs and inactive panes do not stream", { timeout: 8000 }, async() => {
  const socket = `ttt-control-${process.pid}`
  const tmux = (...args: string[]): string => execFileSync("tmux", ["-L", socket, ...args], { encoding: "utf8" })
  let control: ControlClient | undefined
  try {
    tmux("new-session", "-d", "-s", "probe", "-n", "shown", "sh")
    tmux("split-window", "-d", "-t", "probe:shown", "sh")
    tmux("new-window", "-t", "probe", "-n", "hidden", "sh")
    const [shown, sibling] = tmux("list-panes", "-t", "probe:shown", "-F", "#{pane_id}").trim().split("\n")
    const hidden = tmux("display-message", "-p", "-t", "probe:hidden", "#{pane_id}").trim()
    control = new ControlClient("probe", { socket })
    assert.deepEqual((await control.command(["list-panes", "-a", "-F", "#{pane_id}"])).split("\n").sort(), [shown, sibling, hidden].sort())
    assert.equal(await control.command(["display-message", "-p", "%%end 1 2 0"]), "%end 1 2 0")
    const output = new Map<string, string>()
    control.onOutput((pane, bytes) => { output.set(pane, (output.get(pane) ?? "") + bytes.toString("utf8")) })
    await control.show([shown!, sibling!])
    assert.match(await control.command(["display-message", "-p", "#{client_flags}"]), /ignore-size/)
    tmux("send-keys", "-t", shown!, "printf SHOWN_MARKER", "Enter")
    tmux("send-keys", "-t", sibling!, "printf SIBLING_MARKER", "Enter")
    tmux("send-keys", "-t", "probe:hidden", "printf HIDDEN_MARKER", "Enter")
    const deadline = Date.now() + 2000
    while ((!output.get(shown!)?.includes("SHOWN_MARKER") || !output.get(sibling!)?.includes("SIBLING_MARKER")) && Date.now() < deadline) await delay(20)
    assert.ok(output.get(shown!)?.includes("SHOWN_MARKER"))
    assert.ok(output.get(sibling!)?.includes("SIBLING_MARKER"))
    await delay(100)
    assert.ok(!output.get(hidden)?.includes("HIDDEN_MARKER"))
    tmux("send-keys", "-H", "-t", shown!, ...Buffer.from("printf 'UTF_é'\r").toString("hex").match(/../g) ?? [])
    const unicodeDeadline = Date.now() + 2000
    while (!output.get(shown!)?.includes("UTF_é") && Date.now() < unicodeDeadline) await delay(20)
    assert.ok(output.get(shown!)?.includes("UTF_é"))
    assert.equal(controlBytes("\\033[31mred\\015\\012\\134").toString(), "\x1b[31mred\r\n\\")
    await assert.rejects(control.command(["not-a-command"]), /unknown command|parse/)
  } finally {
    control?.close()
    try { tmux("kill-server") } catch { /* Server may have exited with its final pane. */ }
  }
})
